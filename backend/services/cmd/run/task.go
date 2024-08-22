package run

import (
	"bufio"
	"context"
	"errors"
	"github.com/intmian/mian_go_lib/tool/multi"
	"github.com/intmian/platform/backend/services/cmd/tool"
	"io"
	"os/exec"
)

type TaskInit struct {
	tool  *tool.Tool
	param []string
	env   *Env
	ctx   context.Context
}

type TaskIO struct {
	from    string
	content string
}

const (
	TaskIOFromProgram = "program"
	TaskIOFromUser    = "user"
)

/*
Task 运行任务。
*/
type Task struct {
	TaskInit
	taskIOs multi.SafeArr[TaskIO]
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	stdout  io.ReadCloser
}

func (t *Task) Init(init TaskInit) {
	t.TaskInit = init
}

func NewTask(init TaskInit) *Task {
	t := &Task{}
	t.Init(init)
	return t
}

func (t *Task) Run() error {
	var params []string
	if t.tool.Typ == tool.ToolTypePython {
		params = append([]string{t.tool.Addr}, t.param...)
	} else {
		params = t.param
	}
	if t.tool.Typ == tool.ToolTypePython {
		t.cmd = exec.Command("python", params...)
		t.cmd.Env = append(t.cmd.Env, "PYTHONPATH="+t.tool.Addr)
	} else {
		t.cmd = exec.Command(t.tool.Addr, t.param...)
	}
	t.cmd.Dir = t.env.addr

	// 获取标准输入和标准输出
	var err error
	t.stdin, err = t.cmd.StdinPipe()
	if err != nil {
		return errors.New("get stdin pipe failed")
	}

	t.stdout, err = t.cmd.StdoutPipe()
	if err != nil {
		return errors.New("get stdout pipe failed")
	}
	go func() {
		scanner := bufio.NewScanner(t.stdout)
		for scanner.Scan() {
			t.taskIOs.Append(TaskIO{
				from:    TaskIOFromProgram,
				content: scanner.Text(),
			})
		}
	}()

	go func() {
		err = t.cmd.Run()
	}()

	go func() {
		<-t.ctx.Done()
		err := t.cmd.Process.Kill()
		if err != nil {
			t.env.log.WarningErr("TASK", errors.Join(errors.New("kill task failed"), err))
		}
	}()

	if err != nil {
		return errors.New("run task failed")
	}

	return nil
}

func (t *Task) Input(content string) error {
	t.taskIOs.Append(TaskIO{
		from:    TaskIOFromUser,
		content: content,
	})
	_, err := t.stdin.Write([]byte(content))
	if err != nil {
		return errors.Join(errors.New("write to stdin failed"), err)
	}
	return nil
}

func (t *Task) GetNewIO(lastIndex int) []TaskIO {
	res := make([]TaskIO, 0)
	t.taskIOs.SafeUse(func(arr []TaskIO) {
		if lastIndex >= len(arr) {
			return
		}
		res = arr[lastIndex:]
	})
	return res
}
