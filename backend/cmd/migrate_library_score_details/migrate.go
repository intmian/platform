package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/intmian/platform/backend/services/todone/db"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	libraryLogTypeScore = 1
	libraryLogTypeNote  = 2
)

var scoreNamespace = uuid.MustParse("31c81557-daa6-55f2-b5c3-e374f33b10a4")

type backupEntry struct {
	UserID       string `json:"userId"`
	TaskID       uint32 `json:"taskId"`
	OriginalNote string `json:"originalNote"`
	OriginalHash string `json:"originalHash"`
}

type taskMigration struct {
	backupEntry
	TransformedNote string
	Details         []db.LibraryScoreDetailDB
}

type migrationPlan struct {
	Tasks        []taskMigration
	ScoreCount   int
	ComplexCount int
	LegacyCount  int
}

type parsedRound struct {
	Raw  map[string]json.RawMessage
	ID   string
	Logs []map[string]json.RawMessage
}

type scorePosition struct {
	RoundIndex int
	LogIndex   int
	ID         string
}

type legacyScoreData struct {
	Value   uint8  `json:"value"`
	Plus    bool   `json:"plus"`
	Sub     bool   `json:"sub"`
	Comment string `json:"comment"`
}

func sha256String(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func deterministicScoreID(userID string, taskID uint32, roundID string, logIndex int) string {
	return uuid.NewSHA1(scoreNamespace, []byte(fmt.Sprintf("%s/%d/%s/%d", userID, taskID, roundID, logIndex))).String()
}

func deterministicLegacyScoreID(userID string, taskID uint32) string {
	return uuid.NewSHA1(scoreNamespace, []byte(fmt.Sprintf("%s/%d/legacy-main", userID, taskID))).String()
}

func rawInt(raw json.RawMessage) (int, bool) {
	var value int
	if len(raw) == 0 || json.Unmarshal(raw, &value) != nil {
		return 0, false
	}
	return value, true
}

func rawString(raw json.RawMessage) (string, bool) {
	var value string
	if len(raw) == 0 || json.Unmarshal(raw, &value) != nil {
		return "", false
	}
	return value, true
}

func rawBool(raw json.RawMessage) bool {
	var value bool
	_ = json.Unmarshal(raw, &value)
	return value
}

func adjustment(plus, sub bool) (int8, error) {
	if plus && sub {
		return 0, errors.New("score cannot be both plus and sub")
	}
	if plus {
		return 1, nil
	}
	if sub {
		return -1, nil
	}
	return 0, nil
}

func parseDimension(raw json.RawMessage) (*uint8, int8, string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, 0, "", nil
	}
	var value legacyScoreData
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, 0, "", err
	}
	if value.Value < 1 || value.Value > 5 {
		return nil, 0, "", errors.New("score dimension value invalid")
	}
	adjustmentValue, err := adjustment(value.Plus, value.Sub)
	if err != nil {
		return nil, 0, "", err
	}
	return &value.Value, adjustmentValue, value.Comment, nil
}

func parseRounds(root map[string]json.RawMessage, userID string, taskID uint32) ([]parsedRound, []scorePosition, error) {
	var roundRawList []json.RawMessage
	if err := json.Unmarshal(root["rounds"], &roundRawList); err != nil || len(roundRawList) == 0 {
		return nil, nil, errors.New("rounds invalid or empty")
	}
	rounds := make([]parsedRound, 0, len(roundRawList))
	positions := make([]scorePosition, 0)
	seenScoreIDs := make(map[string]struct{})
	for roundIndex, roundRaw := range roundRawList {
		var round map[string]json.RawMessage
		if err := json.Unmarshal(roundRaw, &round); err != nil {
			return nil, nil, fmt.Errorf("round %d invalid: %w", roundIndex, err)
		}
		roundID, ok := rawString(round["id"])
		if !ok {
			return nil, nil, fmt.Errorf("round %d id missing; run library note migration first", roundIndex)
		}
		if _, err := uuid.Parse(roundID); err != nil {
			return nil, nil, fmt.Errorf("round %d id invalid", roundIndex)
		}
		var logRawList []json.RawMessage
		if err := json.Unmarshal(round["logs"], &logRawList); err != nil {
			return nil, nil, fmt.Errorf("round %d logs invalid: %w", roundIndex, err)
		}
		logs := make([]map[string]json.RawMessage, 0, len(logRawList))
		for logIndex, logRaw := range logRawList {
			var log map[string]json.RawMessage
			if err := json.Unmarshal(logRaw, &log); err != nil {
				return nil, nil, fmt.Errorf("round %d log %d invalid: %w", roundIndex, logIndex, err)
			}
			logType, ok := rawInt(log["type"])
			if !ok {
				return nil, nil, fmt.Errorf("round %d log %d type invalid", roundIndex, logIndex)
			}
			if logType == libraryLogTypeNote {
				return nil, nil, fmt.Errorf("round %d still contains embedded note; run library note migration first", roundIndex)
			}
			if logType == libraryLogTypeScore {
				scoreID, _ := rawString(log["id"])
				if scoreID == "" {
					scoreID = deterministicScoreID(userID, taskID, roundID, logIndex)
					log["id"], _ = json.Marshal(scoreID)
				} else if _, err := uuid.Parse(scoreID); err != nil {
					return nil, nil, fmt.Errorf("round %d score %d id invalid", roundIndex, logIndex)
				}
				if _, duplicate := seenScoreIDs[scoreID]; duplicate {
					return nil, nil, fmt.Errorf("duplicate score id %s", scoreID)
				}
				seenScoreIDs[scoreID] = struct{}{}
				positions = append(positions, scorePosition{RoundIndex: roundIndex, LogIndex: logIndex, ID: scoreID})
			}
			logs = append(logs, log)
		}
		rounds = append(rounds, parsedRound{Raw: round, ID: roundID, Logs: logs})
	}
	return rounds, positions, nil
}

func findPosition(positions []scorePosition, roundIndex, logIndex int) *scorePosition {
	for i := range positions {
		if positions[i].RoundIndex == roundIndex && positions[i].LogIndex == logIndex {
			return &positions[i]
		}
	}
	return nil
}

func applyLegacyDetail(root map[string]json.RawMessage, log map[string]json.RawMessage) {
	if mode, _ := rawString(root["scoreMode"]); mode == "complex" {
		log["scoreMode"] = root["scoreMode"]
	}
	for _, key := range []string{"objScore", "subScore", "innovateScore"} {
		if len(log[key]) == 0 && len(root[key]) > 0 {
			log[key] = root[key]
		}
	}
	if _, ok := rawString(log["comment"]); !ok {
		var main legacyScoreData
		if json.Unmarshal(root["mainScore"], &main) == nil && main.Comment != "" {
			log["comment"], _ = json.Marshal(main.Comment)
		} else if comment, ok := rawString(root["comment"]); ok && comment != "" {
			log["comment"], _ = json.Marshal(comment)
		}
	}
}

func synthesizeLegacyScore(root map[string]json.RawMessage, rounds []parsedRound, userID string, taskID uint32) ([]parsedRound, []scorePosition, bool, error) {
	var main legacyScoreData
	if json.Unmarshal(root["mainScore"], &main) != nil || main.Value == 0 {
		return rounds, nil, false, nil
	}
	if main.Value > 5 {
		return nil, nil, false, errors.New("legacy main score value invalid")
	}
	currentRound, ok := rawInt(root["currentRound"])
	if !ok || currentRound < 0 || currentRound >= len(rounds) {
		currentRound = 0
	}
	timeText, _ := rawString(root["updatedAt"])
	if timeText == "" {
		timeText, _ = rawString(root["createdAt"])
	}
	if _, err := time.Parse(time.RFC3339Nano, timeText); err != nil {
		return nil, nil, false, errors.New("legacy main score time invalid")
	}
	scoreID := deterministicLegacyScoreID(userID, taskID)
	log := map[string]json.RawMessage{}
	log["id"], _ = json.Marshal(scoreID)
	log["type"], _ = json.Marshal(libraryLogTypeScore)
	log["time"], _ = json.Marshal(timeText)
	log["score"], _ = json.Marshal(main.Value)
	if main.Plus {
		log["scorePlus"], _ = json.Marshal(true)
	}
	if main.Sub {
		log["scoreSub"], _ = json.Marshal(true)
	}
	applyLegacyDetail(root, log)
	logIndex := len(rounds[currentRound].Logs)
	rounds[currentRound].Logs = append(rounds[currentRound].Logs, log)
	return rounds, []scorePosition{{RoundIndex: currentRound, LogIndex: logIndex, ID: scoreID}}, true, nil
}

func detailFromLog(userID string, taskID uint32, roundID, scoreID string, log map[string]json.RawMessage) (db.LibraryScoreDetailDB, bool, error) {
	timeText, ok := rawString(log["time"])
	if !ok {
		return db.LibraryScoreDetailDB{}, false, errors.New("score time missing")
	}
	eventTime, err := time.Parse(time.RFC3339Nano, timeText)
	if err != nil {
		return db.LibraryScoreDetailDB{}, false, err
	}
	value, ok := rawInt(log["score"])
	if !ok || value < 1 || value > 5 {
		return db.LibraryScoreDetailDB{}, false, errors.New("score value invalid")
	}
	if _, err = adjustment(rawBool(log["scorePlus"]), rawBool(log["scoreSub"])); err != nil {
		return db.LibraryScoreDetailDB{}, false, err
	}
	mode, _ := rawString(log["scoreMode"])
	complex := mode == "complex" || len(log["objScore"]) > 0 || len(log["subScore"]) > 0 || len(log["innovateScore"]) > 0
	if complex {
		mode = "complex"
	} else {
		mode = "simple"
	}
	objValue, objAdjustment, objComment, err := parseDimension(log["objScore"])
	if err != nil {
		return db.LibraryScoreDetailDB{}, false, err
	}
	subValue, subAdjustment, subComment, err := parseDimension(log["subScore"])
	if err != nil {
		return db.LibraryScoreDetailDB{}, false, err
	}
	innovateValue, innovateAdjustment, innovateComment, err := parseDimension(log["innovateScore"])
	if err != nil {
		return db.LibraryScoreDetailDB{}, false, err
	}
	comment, _ := rawString(log["comment"])
	detail := db.LibraryScoreDetailDB{
		ID: scoreID, UserID: userID, TaskID: taskID, RoundID: roundID, Mode: mode, Comment: comment,
		ObjValue: objValue, ObjAdjustment: objAdjustment, ObjComment: objComment,
		SubValue: subValue, SubAdjustment: subAdjustment, SubComment: subComment,
		InnovateValue: innovateValue, InnovateAdjustment: innovateAdjustment, InnovateComment: innovateComment,
		Revision: 1, CreatedAt: eventTime.UTC(), UpdatedAt: eventTime.UTC(),
	}
	return detail, complex, nil
}

func transformTask(userID string, taskID uint32, original string) (taskMigration, int, bool, error) {
	result := taskMigration{backupEntry: backupEntry{UserID: userID, TaskID: taskID, OriginalNote: original, OriginalHash: sha256String(original)}}
	var root map[string]json.RawMessage
	if err := json.Unmarshal([]byte(original), &root); err != nil {
		return result, 0, false, err
	}
	rounds, positions, err := parseRounds(root, userID, taskID)
	if err != nil {
		return result, 0, false, fmt.Errorf("task %d: %w", taskID, err)
	}
	legacyCreated := false
	if len(positions) == 0 {
		var created []scorePosition
		rounds, created, legacyCreated, err = synthesizeLegacyScore(root, rounds, userID, taskID)
		if err != nil {
			return result, 0, false, fmt.Errorf("task %d: %w", taskID, err)
		}
		positions = append(positions, created...)
	}

	mainScoreID, hasMainID := rawString(root["mainScoreID"])
	mainRoundIndex, hasMainRound := rawInt(root["mainScoreRoundIndex"])
	mainLogIndex, hasMainLog := rawInt(root["mainScoreLogIndex"])
	if hasMainRound != hasMainLog {
		return result, 0, false, fmt.Errorf("task %d incomplete main score index", taskID)
	}
	var mainPosition *scorePosition
	if hasMainID {
		for i := range positions {
			if positions[i].ID == mainScoreID {
				mainPosition = &positions[i]
				break
			}
		}
		if mainPosition == nil {
			return result, 0, false, fmt.Errorf("task %d main score id not found", taskID)
		}
	} else if hasMainRound {
		mainPosition = findPosition(positions, mainRoundIndex, mainLogIndex)
		if mainPosition == nil {
			return result, 0, false, fmt.Errorf("task %d main score index invalid", taskID)
		}
		mainScoreID = mainPosition.ID
		hasMainID = true
	} else if legacyCreated && len(positions) == 1 {
		mainPosition = &positions[0]
		mainScoreID = mainPosition.ID
		hasMainID = true
	}
	legacyTarget := mainPosition
	if legacyTarget == nil && len(positions) > 0 {
		legacyTarget = &positions[len(positions)-1]
	}
	if legacyTarget != nil {
		applyLegacyDetail(root, rounds[legacyTarget.RoundIndex].Logs[legacyTarget.LogIndex])
	}

	complexCount := 0
	for _, position := range positions {
		log := rounds[position.RoundIndex].Logs[position.LogIndex]
		detail, complex, detailErr := detailFromLog(userID, taskID, rounds[position.RoundIndex].ID, position.ID, log)
		if detailErr != nil {
			return result, 0, false, fmt.Errorf("task %d score %s: %w", taskID, position.ID, detailErr)
		}
		if complex {
			complexCount++
		}
		result.Details = append(result.Details, detail)
		delete(log, "comment")
		delete(log, "scoreMode")
		delete(log, "objScore")
		delete(log, "subScore")
		delete(log, "innovateScore")
	}
	for i := range rounds {
		encodedLogs := make([]json.RawMessage, 0, len(rounds[i].Logs))
		for _, log := range rounds[i].Logs {
			encoded, marshalErr := json.Marshal(log)
			if marshalErr != nil {
				return result, 0, false, marshalErr
			}
			encodedLogs = append(encodedLogs, encoded)
		}
		rounds[i].Raw["logs"], _ = json.Marshal(encodedLogs)
	}
	encodedRounds := make([]json.RawMessage, 0, len(rounds))
	for _, round := range rounds {
		encoded, marshalErr := json.Marshal(round.Raw)
		if marshalErr != nil {
			return result, 0, false, marshalErr
		}
		encodedRounds = append(encodedRounds, encoded)
	}
	root["rounds"], _ = json.Marshal(encodedRounds)
	if hasMainID {
		root["mainScoreID"], _ = json.Marshal(mainScoreID)
	} else {
		delete(root, "mainScoreID")
	}
	for _, key := range []string{"mainScoreRoundIndex", "mainScoreLogIndex", "scoreMode", "objScore", "subScore", "innovateScore", "mainScore", "comment"} {
		delete(root, key)
	}
	encoded, err := json.Marshal(root)
	if err != nil {
		return result, 0, false, err
	}
	result.TransformedNote = string(encoded)
	return result, complexCount, legacyCreated, nil
}

func buildMigrationPlan(conn *gorm.DB) (*migrationPlan, error) {
	var groups []db.GroupDB
	if err := conn.Where("type = ?", db.GroupTypeLibrary).Find(&groups).Error; err != nil {
		return nil, err
	}
	plan := &migrationPlan{}
	for _, group := range groups {
		var subGroups []db.SubGroupDB
		if err := conn.Where("parent_group_id = ?", group.ID).Find(&subGroups).Error; err != nil {
			return nil, err
		}
		for _, subGroup := range subGroups {
			var tasks []db.TaskDB
			if err := conn.Where("parent_sub_group_id = ?", subGroup.ID).Find(&tasks).Error; err != nil {
				return nil, err
			}
			for _, task := range tasks {
				migration, complexCount, legacyCreated, err := transformTask(task.UserID, task.TaskID, task.Note)
				if err != nil {
					return nil, err
				}
				plan.Tasks = append(plan.Tasks, migration)
				plan.ScoreCount += len(migration.Details)
				plan.ComplexCount += complexCount
				if legacyCreated {
					plan.LegacyCount++
				}
			}
		}
	}
	sort.Slice(plan.Tasks, func(i, j int) bool { return plan.Tasks[i].TaskID < plan.Tasks[j].TaskID })
	return plan, nil
}

func printPlan(plan *migrationPlan) {
	fmt.Printf("tasks=%d scores=%d complex=%d legacy_synthesized=%d\n", len(plan.Tasks), plan.ScoreCount, plan.ComplexCount, plan.LegacyCount)
}

func writeBackup(path string, plan *migrationPlan) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer file.Close()
	encoder := json.NewEncoder(file)
	for _, task := range plan.Tasks {
		if err := encoder.Encode(task.backupEntry); err != nil {
			return err
		}
	}
	return file.Sync()
}

func readBackup(path string) ([]backupEntry, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	entries := make([]backupEntry, 0)
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		var entry backupEntry
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			return nil, err
		}
		if sha256String(entry.OriginalNote) != entry.OriginalHash {
			return nil, fmt.Errorf("backup hash mismatch for task %d", entry.TaskID)
		}
		entries = append(entries, entry)
	}
	return entries, scanner.Err()
}

func applyMigration(conn *gorm.DB, backupPath string) error {
	plan, err := buildMigrationPlan(conn)
	if err != nil {
		return err
	}
	printPlan(plan)
	if err = writeBackup(backupPath, plan); err != nil {
		return fmt.Errorf("write backup: %w", err)
	}
	if err = conn.AutoMigrate(&db.LibraryScoreDetailDB{}); err != nil {
		return err
	}
	for _, task := range plan.Tasks {
		for i := range task.Details {
			detail := task.Details[i]
			if err = conn.Clauses(clause.OnConflict{DoNothing: true}).Create(&detail).Error; err != nil {
				return err
			}
			var stored db.LibraryScoreDetailDB
			if err = conn.Unscoped().Where("id = ?", detail.ID).First(&stored).Error; err != nil {
				return err
			}
			if !sameScoreDetailContent(&stored, &detail) {
				return fmt.Errorf("stored score detail mismatch for %s", detail.ID)
			}
		}
	}
	updated := make([]taskMigration, 0, len(plan.Tasks))
	for _, task := range plan.Tasks {
		result := conn.Model(&db.TaskDB{}).Where("task_id = ? AND note = ?", task.TaskID, task.OriginalNote).UpdateColumn("note", task.TransformedNote)
		if result.Error != nil || result.RowsAffected != 1 {
			_ = rollbackPlan(conn, updated, plan.Tasks)
			if result.Error != nil {
				return result.Error
			}
			return fmt.Errorf("task %d update affected %d rows", task.TaskID, result.RowsAffected)
		}
		updated = append(updated, task)
	}
	return verifyPlan(conn, plan)
}

func verifyPlan(conn *gorm.DB, plan *migrationPlan) error {
	for _, task := range plan.Tasks {
		var stored db.TaskDB
		if err := conn.Where("task_id = ?", task.TaskID).First(&stored).Error; err != nil {
			return err
		}
		if stored.Note != task.TransformedNote {
			return fmt.Errorf("task %d transformed note mismatch", task.TaskID)
		}
		for _, expected := range task.Details {
			var actual db.LibraryScoreDetailDB
			if err := conn.Unscoped().Where("id = ?", expected.ID).First(&actual).Error; err != nil {
				return err
			}
			if !sameScoreDetailContent(&actual, &expected) {
				return fmt.Errorf("score detail %s verification mismatch", expected.ID)
			}
		}
	}
	printPlan(plan)
	return nil
}

func planFromBackup(entries []backupEntry) (*migrationPlan, error) {
	plan := &migrationPlan{}
	for _, entry := range entries {
		task, complexCount, legacyCreated, err := transformTask(entry.UserID, entry.TaskID, entry.OriginalNote)
		if err != nil {
			return nil, err
		}
		plan.Tasks = append(plan.Tasks, task)
		plan.ScoreCount += len(task.Details)
		plan.ComplexCount += complexCount
		if legacyCreated {
			plan.LegacyCount++
		}
	}
	return plan, nil
}

func verifyFromBackup(conn *gorm.DB, path string) error {
	entries, err := readBackup(path)
	if err != nil {
		return err
	}
	plan, err := planFromBackup(entries)
	if err != nil {
		return err
	}
	return verifyPlan(conn, plan)
}

func rollbackPlan(conn *gorm.DB, updated []taskMigration, all []taskMigration) error {
	var rollbackErr error
	for _, task := range updated {
		result := conn.Model(&db.TaskDB{}).Where("task_id = ? AND note = ?", task.TaskID, task.TransformedNote).UpdateColumn("note", task.OriginalNote)
		if result.Error != nil {
			rollbackErr = errors.Join(rollbackErr, result.Error)
		} else if result.RowsAffected != 1 {
			rollbackErr = errors.Join(rollbackErr, fmt.Errorf("task %d rollback affected %d rows", task.TaskID, result.RowsAffected))
		}
	}
	if rollbackErr != nil {
		return rollbackErr
	}
	for _, task := range all {
		for _, detail := range task.Details {
			if err := conn.Unscoped().Where("id = ?", detail.ID).Delete(&db.LibraryScoreDetailDB{}).Error; err != nil {
				rollbackErr = errors.Join(rollbackErr, err)
			}
		}
	}
	return rollbackErr
}

func sameOptionalUint8(a, b *uint8) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func sameScoreDetailContent(a, b *db.LibraryScoreDetailDB) bool {
	return a.ID == b.ID && a.UserID == b.UserID && a.TaskID == b.TaskID && a.RoundID == b.RoundID &&
		a.Mode == b.Mode && a.Comment == b.Comment &&
		sameOptionalUint8(a.ObjValue, b.ObjValue) && a.ObjAdjustment == b.ObjAdjustment && a.ObjComment == b.ObjComment &&
		sameOptionalUint8(a.SubValue, b.SubValue) && a.SubAdjustment == b.SubAdjustment && a.SubComment == b.SubComment &&
		sameOptionalUint8(a.InnovateValue, b.InnovateValue) && a.InnovateAdjustment == b.InnovateAdjustment &&
		a.InnovateComment == b.InnovateComment && a.Revision == b.Revision && a.DeletedAt.Valid == b.DeletedAt.Valid
}

func verifyRollbackSafe(conn *gorm.DB, plan *migrationPlan) error {
	for _, task := range plan.Tasks {
		var stored db.TaskDB
		if err := conn.Where("task_id = ?", task.TaskID).First(&stored).Error; err != nil {
			return err
		}
		if stored.Note != task.TransformedNote {
			return fmt.Errorf("task %d changed after migration; refuse rollback", task.TaskID)
		}
		var count int64
		if err := conn.Unscoped().Model(&db.LibraryScoreDetailDB{}).
			Where("user_id = ? AND task_id = ?", task.UserID, task.TaskID).Count(&count).Error; err != nil {
			return err
		}
		if count != int64(len(task.Details)) {
			return fmt.Errorf("task %d score detail count changed after migration; refuse rollback", task.TaskID)
		}
		for _, expected := range task.Details {
			var actual db.LibraryScoreDetailDB
			if err := conn.Unscoped().Where("id = ?", expected.ID).First(&actual).Error; err != nil {
				return err
			}
			if !sameScoreDetailContent(&actual, &expected) {
				return fmt.Errorf("score detail %s changed after migration; refuse rollback", expected.ID)
			}
		}
	}
	return nil
}

func rollbackFromBackup(conn *gorm.DB, path string) error {
	entries, err := readBackup(path)
	if err != nil {
		return err
	}
	plan, err := planFromBackup(entries)
	if err != nil {
		return err
	}
	if err = verifyRollbackSafe(conn, plan); err != nil {
		return err
	}
	return rollbackPlan(conn, plan.Tasks, plan.Tasks)
}
