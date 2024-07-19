package runmgr

import (
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"sync"
	"syscall"
	"time"
)

// 定义枚举
type ScriptType int

const (
	PythonScript ScriptType = iota
	Executable
)

// 定义辅助类
type SystemInfo struct {
	PythonVersion string
	SystemVersion string
	MemoryUsage   uint64
	CPUUsage      float64
}

// 任务信息结构体
type TaskInfo struct {
	ScriptID        string
	ScriptType      ScriptType
	ScriptPath      string
	Args            []string
	Input           string
	Output          string
	Err             string
	Status          string
	StartTime       time.Time
	EndTime         time.Time
	TaskEnvironment string
}

// 定义主要结构体
type RunMgr struct {
	baseDir  string
	tasks    map[string]*TaskInfo
	taskLock sync.Mutex
}

// 枚举类型的字符串表示
func (s ScriptType) String() string {
	return [...]string{"PythonScript", "Executable"}[s]
}

// 创建新的 RunMgr
func NewRunMgr(baseDir string) *RunMgr {
	return &RunMgr{
		baseDir: baseDir,
		tasks:   make(map[string]*TaskInfo),
	}
}

// 获取系统信息
func (rm *RunMgr) GetSystemInfo() SystemInfo {
	pythonVersion, err := exec.Command("python", "--version").Output()
	if err != nil {
		pythonVersion = []byte("Python not found")
	}

	systemVersion := runtime.GOOS + " " + runtime.GOARCH

	var memStat syscall.Sysinfo_t
	syscall.Sysinfo(&memStat)
	memoryUsage := memStat.Totalram - memStat.Freeram
	cpuUsage := 0.0 // 简化处理，实际获取 CPU 使用率需要复杂计算

	return SystemInfo{
		PythonVersion: string(pythonVersion),
		SystemVersion: systemVersion,
		MemoryUsage:   memoryUsage,
		CPUUsage:      cpuUsage,
	}
}

// 增加运行任务
func (rm *RunMgr) AddTask(scriptID string, scriptType ScriptType, scriptPath string, args []string) {
	rm.taskLock.Lock()
	defer rm.taskLock.Unlock()

	taskEnv := filepath.Join(rm.baseDir, scriptID, strconv.Itoa(len(rm.tasks)))
	rm.tasks[scriptID] = &TaskInfo{
		ScriptID:        scriptID,
		ScriptType:      scriptType,
		ScriptPath:      scriptPath,
		Args:            args,
		Status:          "Pending",
		TaskEnvironment: taskEnv,
	}
}

// 获取所有运行任务的任务ID
func (rm *RunMgr) GetAllTaskIDs() []string {
	rm.taskLock.Lock()
	defer rm.taskLock.Unlock()

	ids := []string{}
	for id := range rm.tasks {
		ids = append(ids, id)
	}
	return ids
}

// 获取单个任务的运行情况
func (rm *RunMgr) GetTaskStatus(taskID string) (*TaskInfo, error) {
	rm.taskLock.Lock()
	defer rm.taskLock.Unlock()

	task, exists := rm.tasks[taskID]
	if !exists {
		return nil, errors.New("task not found")
	}
	return task, nil
}

// 运行任务
func (rm *RunMgr) RunTask(taskID string) error {
	rm.taskLock.Lock()
	task, exists := rm.tasks[taskID]
	if !exists {
		rm.taskLock.Unlock()
		return errors.New("task not found")
	}
	task.Status = "Running"
	task.StartTime = time.Now()
	rm.taskLock.Unlock()

	scriptDir := task.TaskEnvironment
	if err := os.MkdirAll(scriptDir, 0755); err != nil {
		return err
	}

	var cmd *exec.Cmd
	if task.ScriptType == PythonScript {
		cmd = exec.Command("python", append([]string{task.ScriptPath}, task.Args...)...)
	} else if task.ScriptType == Executable {
		cmd = exec.Command(task.ScriptPath, task.Args...)
	}

	cmd.Dir = scriptDir

	output, err := cmd.CombinedOutput()
	rm.taskLock.Lock()
	defer rm.taskLock.Unlock()

	task.Output = string(output)
	if err != nil {
		task.Err = err.Error()
		task.Status = "Failed"
	} else {
		task.Status = "Completed"
	}
	task.EndTime = time.Now()

	return nil
}

// 允许外部调用接口输入字符串输入
func (rm *RunMgr) SetTaskInput(taskID, input string) error {
	rm.taskLock.Lock()
	defer rm.taskLock.Unlock()

	task, exists := rm.tasks[taskID]
	if !exists {
		return errors.New("task not found")
	}
	task.Input = input
	return nil
}

// 允许外部调用接口直接上传文件
func (rm *RunMgr) UploadFile(taskID, filename, fileContent string) error {
	rm.taskLock.Lock()
	task, exists := rm.tasks[taskID]
	rm.taskLock.Unlock()

	if !exists {
		return errors.New("task not found")
	}

	scriptDir := task.TaskEnvironment
	filePath := filepath.Join(scriptDir, filename)
	return ioutil.WriteFile(filePath, []byte(fileContent), 0644)
}

// 查询文件树
func (rm *RunMgr) ListFiles(taskID string) ([]os.FileInfo, error) {
	rm.taskLock.Lock()
	task, exists := rm.tasks[taskID]
	rm.taskLock.Unlock()

	if !exists {
		return nil, errors.New("task not found")
	}

	return ioutil.ReadDir(task.TaskEnvironment)
}

// 查询文件大小和创建时间
func (rm *RunMgr) GetFileDetails(taskID, filename string) (os.FileInfo, error) {
	rm.taskLock.Lock()
	task, exists := rm.tasks[taskID]
	rm.taskLock.Unlock()

	if !exists {
		return nil, errors.New("task not found")
	}

	filePath := filepath.Join(task.TaskEnvironment, filename)
	return os.Stat(filePath)
}

// 以特定编码读取文件
func (rm *RunMgr) ReadFile(taskID, filename string) (string, error) {
	rm.taskLock.Lock()
	task, exists := rm.tasks[taskID]
	rm.taskLock.Unlock()

	if !exists {
		return "", errors.New("task not found")
	}

	filePath := filepath.Join(task.TaskEnvironment, filename)
	content, err := ioutil.ReadFile(filePath)
	if err != nil {
		return "", err
	}

	return string(content), nil
}

// 覆写文件
func (rm *RunMgr) WriteFile(taskID, filename, content string) error {
	rm.taskLock.Lock()
	task, exists := rm.tasks[taskID]
	rm.taskLock.Unlock()

	if !exists {
		return errors.New("task not found")
	}

	filePath := filepath.Join(task.TaskEnvironment, filename)
	return ioutil.WriteFile(filePath, []byte(content), 0644)
}

// 清空所有文件
func (rm *RunMgr) ClearAllFiles(taskID string) error {
	rm.taskLock.Lock()
	task, exists := rm.tasks[taskID]
	rm.taskLock.Unlock()

	if !exists {
		return errors.New("task not found")
	}

	return os.RemoveAll(task.TaskEnvironment)
}

// TODO: 数据持久化代码
// 你可以在这里实现数据持久化功能，例如将任务信息保存到数据库或文件中，并在启动时加载

func main() {
	// 示例代码，用于展示如何使用 RunMgr
	rm := NewRunMgr("/path/to/base/dir")

	// 添加任务
	rm.AddTask("task1", PythonScript, "/path/to/script.py", []string{"arg1", "arg2"})

	// 获取所有任务ID
	ids := rm.GetAllTaskIDs()
	for _, id := range ids {
		fmt.Println("Task ID:", id)
	}

	// 获取任务状态
	status, err := rm.GetTaskStatus("task1")
	if err != nil {
		fmt.Println("Error getting task status:", err)
	} else {
		fmt.Println("Task Status:", status)
	}

	// 运行任务
	err = rm.RunTask("task1")
	if err != nil {
		fmt.Println("Error running task:", err)
	}

	// 上传文件
	err = rm.UploadFile("task1", "input.txt", "Hello, World!")
	if err != nil {
		fmt.Println("Error uploading file:", err)
	}

	// 查询文件列表
	files, err := rm.ListFiles("task1")
	if err != nil {
		fmt.Println("Error listing files:", err)
	} else {
		for _, file := range files {
			fmt.Println("File:", file.Name())
		}
	}

	// 清空所有文件
	err = rm.ClearAllFiles("task1")
	if err != nil {
		fmt.Println("Error clearing files:", err)
	}
}
