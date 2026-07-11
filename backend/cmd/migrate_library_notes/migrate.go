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
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/intmian/platform/backend/services/todone/db"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	libraryLogTypeScore        = 1
	libraryLogTypeNote         = 2
	libraryLogTypeAddToLibrary = 4
)

var (
	roundNamespace = uuid.MustParse("3508bc98-161d-5ab4-94ab-8ec6f67a1490")
	noteNamespace  = uuid.MustParse("7d27bb1b-f77b-5bb5-9d2f-80cd0f286ac7")
)

type backupEntry struct {
	UserID       string `json:"userId"`
	TaskID       uint32 `json:"taskId"`
	OriginalNote string `json:"originalNote"`
	OriginalHash string `json:"originalHash"`
}

type taskMigration struct {
	backupEntry
	TransformedNote string
	Notes           []db.LibraryNoteDB
	RoundCount      int
	LegacyAddCount  int
}

type migrationPlan struct {
	Tasks          []taskMigration
	RoundCount     int
	NoteCount      int
	LegacyAddCount int
}

func sha256String(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func deterministicRoundID(userID string, taskID uint32, roundIndex int) string {
	return uuid.NewSHA1(roundNamespace, []byte(fmt.Sprintf("%s/%d/%d", userID, taskID, roundIndex))).String()
}

func deterministicNoteID(userID string, taskID uint32, roundID string, logIndex int) string {
	return uuid.NewSHA1(noteNamespace, []byte(fmt.Sprintf("%s/%d/%s/%d", userID, taskID, roundID, logIndex))).String()
}

func rawInt(raw json.RawMessage) (int, bool) {
	if len(raw) == 0 {
		return 0, false
	}
	var value int
	if json.Unmarshal(raw, &value) != nil {
		return 0, false
	}
	return value, true
}

func rawString(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 {
		return "", false
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return "", false
	}
	return value, true
}

func transformTask(userID string, taskID uint32, original string) (taskMigration, error) {
	result := taskMigration{backupEntry: backupEntry{
		UserID: userID, TaskID: taskID, OriginalNote: original, OriginalHash: sha256String(original),
	}}
	var root map[string]json.RawMessage
	if err := json.Unmarshal([]byte(original), &root); err != nil {
		return result, fmt.Errorf("task %d invalid LibraryExtra JSON: %w", taskID, err)
	}
	var rounds []json.RawMessage
	if err := json.Unmarshal(root["rounds"], &rounds); err != nil || len(rounds) == 0 {
		return result, fmt.Errorf("task %d rounds invalid or empty", taskID)
	}
	mainRoundIndex, hasMainRound := rawInt(root["mainScoreRoundIndex"])
	mainLogIndex, hasMainLog := rawInt(root["mainScoreLogIndex"])
	if hasMainRound != hasMainLog {
		return result, fmt.Errorf("task %d incomplete main score index", taskID)
	}

	seenRoundIDs := make(map[string]struct{}, len(rounds))
	for roundIndex, roundRaw := range rounds {
		var round map[string]json.RawMessage
		if err := json.Unmarshal(roundRaw, &round); err != nil {
			return result, fmt.Errorf("task %d round %d invalid: %w", taskID, roundIndex, err)
		}
		roundID, _ := rawString(round["id"])
		if roundID == "" {
			roundID = deterministicRoundID(userID, taskID, roundIndex)
		} else if _, err := uuid.Parse(roundID); err != nil {
			return result, fmt.Errorf("task %d round %d id invalid", taskID, roundIndex)
		}
		if _, duplicate := seenRoundIDs[roundID]; duplicate {
			return result, fmt.Errorf("task %d duplicate round id %s", taskID, roundID)
		}
		seenRoundIDs[roundID] = struct{}{}
		round["id"], _ = json.Marshal(roundID)

		var logs []json.RawMessage
		if err := json.Unmarshal(round["logs"], &logs); err != nil {
			return result, fmt.Errorf("task %d round %d logs invalid: %w", taskID, roundIndex, err)
		}
		kept := make([]json.RawMessage, 0, len(logs))
		newMainLogIndex := mainLogIndex
		for logIndex, logRaw := range logs {
			var log map[string]json.RawMessage
			if err := json.Unmarshal(logRaw, &log); err != nil {
				return result, fmt.Errorf("task %d round %d log %d invalid: %w", taskID, roundIndex, logIndex, err)
			}
			logType, ok := rawInt(log["type"])
			if !ok {
				return result, fmt.Errorf("task %d round %d log %d type invalid", taskID, roundIndex, logIndex)
			}
			if logType != libraryLogTypeNote {
				kept = append(kept, logRaw)
				continue
			}
			comment, _ := rawString(log["comment"])
			if strings.TrimSpace(comment) == "添加到库" {
				log["type"], _ = json.Marshal(libraryLogTypeAddToLibrary)
				delete(log, "comment")
				normalized, err := json.Marshal(log)
				if err != nil {
					return result, err
				}
				kept = append(kept, normalized)
				result.LegacyAddCount++
				continue
			}
			if hasMainRound && roundIndex == mainRoundIndex && logIndex == mainLogIndex {
				return result, fmt.Errorf("task %d main score points to a note", taskID)
			}
			timeText, ok := rawString(log["time"])
			if !ok {
				return result, fmt.Errorf("task %d round %d note %d time missing", taskID, roundIndex, logIndex)
			}
			eventTime, err := time.Parse(time.RFC3339Nano, timeText)
			if err != nil {
				return result, fmt.Errorf("task %d round %d note %d time invalid: %w", taskID, roundIndex, logIndex, err)
			}
			result.Notes = append(result.Notes, db.LibraryNoteDB{
				ID: deterministicNoteID(userID, taskID, roundID, logIndex), UserID: userID, TaskID: taskID,
				RoundID: roundID, EventTime: eventTime.UTC(), Content: comment, Revision: 1,
				CreatedAt: eventTime.UTC(), UpdatedAt: eventTime.UTC(),
			})
			if hasMainRound && roundIndex == mainRoundIndex && logIndex < mainLogIndex {
				newMainLogIndex--
			}
		}
		if hasMainRound && roundIndex == mainRoundIndex {
			if mainLogIndex < 0 || mainLogIndex >= len(logs) {
				return result, fmt.Errorf("task %d main score log index out of range", taskID)
			}
			var selected map[string]json.RawMessage
			if err := json.Unmarshal(logs[mainLogIndex], &selected); err != nil {
				return result, err
			}
			selectedType, _ := rawInt(selected["type"])
			if selectedType != libraryLogTypeScore {
				return result, fmt.Errorf("task %d main score does not point to score", taskID)
			}
			root["mainScoreLogIndex"], _ = json.Marshal(newMainLogIndex)
		}
		round["logs"], _ = json.Marshal(kept)
		encodedRound, err := json.Marshal(round)
		if err != nil {
			return result, err
		}
		rounds[roundIndex] = encodedRound
		result.RoundCount++
	}
	if hasMainRound && (mainRoundIndex < 0 || mainRoundIndex >= len(rounds)) {
		return result, fmt.Errorf("task %d main score round index out of range", taskID)
	}
	root["rounds"], _ = json.Marshal(rounds)
	encoded, err := json.Marshal(root)
	if err != nil {
		return result, err
	}
	result.TransformedNote = string(encoded)
	return result, nil
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
				migration, err := transformTask(task.UserID, task.TaskID, task.Note)
				if err != nil {
					return nil, err
				}
				plan.Tasks = append(plan.Tasks, migration)
				plan.RoundCount += migration.RoundCount
				plan.NoteCount += len(migration.Notes)
				plan.LegacyAddCount += migration.LegacyAddCount
			}
		}
	}
	sort.Slice(plan.Tasks, func(i, j int) bool { return plan.Tasks[i].TaskID < plan.Tasks[j].TaskID })
	return plan, nil
}

func printPlan(plan *migrationPlan) {
	fmt.Printf("tasks=%d rounds=%d notes=%d legacy_add_to_library=%d\n", len(plan.Tasks), plan.RoundCount, plan.NoteCount, plan.LegacyAddCount)
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
	buffer := make([]byte, 64*1024)
	scanner.Buffer(buffer, 4*1024*1024)
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
	if err = conn.AutoMigrate(&db.LibraryNoteDB{}); err != nil {
		return err
	}
	for _, task := range plan.Tasks {
		for i := range task.Notes {
			note := task.Notes[i]
			if err = conn.Clauses(clause.OnConflict{DoNothing: true}).Create(&note).Error; err != nil {
				return err
			}
			var stored db.LibraryNoteDB
			if err = conn.Unscoped().Where("id = ?", note.ID).First(&stored).Error; err != nil {
				return err
			}
			if stored.UserID != note.UserID || stored.TaskID != note.TaskID || stored.RoundID != note.RoundID ||
				stored.Content != note.Content || !stored.EventTime.Equal(note.EventTime) {
				return fmt.Errorf("stored note mismatch for %s", note.ID)
			}
		}
	}
	updatedTasks := make([]taskMigration, 0, len(plan.Tasks))
	for _, task := range plan.Tasks {
		result := conn.Model(&db.TaskDB{}).Where("task_id = ? AND note = ?", task.TaskID, task.OriginalNote).
			UpdateColumn("note", task.TransformedNote)
		if result.Error != nil || result.RowsAffected != 1 {
			_ = rollbackPlan(conn, updatedTasks, plan.Tasks)
			if result.Error != nil {
				return result.Error
			}
			return fmt.Errorf("task %d update affected %d rows", task.TaskID, result.RowsAffected)
		}
		updatedTasks = append(updatedTasks, task)
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
		for _, expected := range task.Notes {
			var actual db.LibraryNoteDB
			if err := conn.Unscoped().Where("id = ?", expected.ID).First(&actual).Error; err != nil {
				return err
			}
			if actual.Content != expected.Content || actual.RoundID != expected.RoundID || !actual.EventTime.Equal(expected.EventTime) {
				return fmt.Errorf("note %s verification mismatch", expected.ID)
			}
		}
	}
	printPlan(plan)
	return nil
}

func planFromBackup(entries []backupEntry) (*migrationPlan, error) {
	plan := &migrationPlan{}
	for _, entry := range entries {
		task, err := transformTask(entry.UserID, entry.TaskID, entry.OriginalNote)
		if err != nil {
			return nil, err
		}
		plan.Tasks = append(plan.Tasks, task)
		plan.RoundCount += task.RoundCount
		plan.NoteCount += len(task.Notes)
		plan.LegacyAddCount += task.LegacyAddCount
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
		if err := conn.Model(&db.TaskDB{}).Where("task_id = ?", task.TaskID).UpdateColumn("note", task.OriginalNote).Error; err != nil {
			rollbackErr = errors.Join(rollbackErr, err)
		}
	}
	for _, task := range all {
		for _, note := range task.Notes {
			if err := conn.Unscoped().Where("id = ?", note.ID).Delete(&db.LibraryNoteDB{}).Error; err != nil {
				rollbackErr = errors.Join(rollbackErr, err)
			}
		}
	}
	return rollbackErr
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
	return rollbackPlan(conn, plan.Tasks, plan.Tasks)
}
