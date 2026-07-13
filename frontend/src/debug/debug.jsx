import {useState} from "react";
import {Alert, Button, Card, Col, Flex, Input, InputNumber, Modal, Row, Slider, Space, Typography} from "antd";
import {CustomDeviceSimulator, DeviceSimulator} from "./DeviceSim.jsx";
import {MenuPlus} from "../common/MenuPlus.jsx";
import {EditableProps} from "./EditableProps.jsx";
import {ConfigsType, ConfigType} from "../common/UniConfigDef.js";
import {ConfigsCtr} from "../common/UniConfig.jsx";
import {WhisperButton} from "../common/WhisperButton.tsx";
import {Editor as TaskDetailEditor} from "../todone/TaskDetailEditor.tsx";

const {Text} = Typography;

const config = new ConfigsCtr(ConfigsType.Plat)

config.addBaseConfig('test', '测试', ConfigType.SliceString, 'test')
config.addBaseConfig('realKey', '真实2', ConfigType.String, 'realKey')

function WhisperDebugPanel() {
    const [text, setText] = useState("");
    const [lastResponse, setLastResponse] = useState(null);
    const [lastError, setLastError] = useState("");

    return (
        <Card
            title="语音转文字"
            style={{
                maxWidth: 720,
                margin: 16,
            }}
        >
            <Space direction="vertical" size="middle" style={{width: "100%"}}>
                <Space wrap>
                    <WhisperButton
                        tooltip="点击开始 / 停止录音"
                        onText={(nextText, response) => {
                            setText(nextText);
                            setLastResponse(response);
                            setLastError("");
                        }}
                        onError={(error) => {
                            setLastError(error);
                        }}
                    />
                    <Button onClick={() => {
                        setText("");
                        setLastResponse(null);
                        setLastError("");
                    }}>
                        清空
                    </Button>
                </Space>
                {lastError ? <Alert type="error" showIcon message={lastError}/> : null}
                <Input.TextArea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    autoSize={{minRows: 6, maxRows: 12}}
                    placeholder="转写结果会显示在这里"
                />
                {lastResponse ? (
                    <Typography.Text type="secondary">
                        language: {lastResponse.language || "-"} / duration: {lastResponse.duration ?? "-"}
                    </Typography.Text>
                ) : null}
            </Space>
        </Card>
    );
}

function appendTranscriptionText(current, transcription) {
    const next = transcription.trim();
    if (!next) return current;
    if (!current || /\s$/.test(current)) return current + next;
    return `${current}\n${next}`;
}

function LibraryNoteModalDebugPanel() {
    const [mode, setMode] = useState(null);
    const [draft, setDraft] = useState("");
    const [recording, setRecording] = useState(false);
    const [confirmedText, setConfirmedText] = useState("");

    const openModal = (nextMode) => {
        setMode(nextMode);
        setDraft(nextMode === "edit" ? "这是一条待编辑的备注。" : "");
        setRecording(false);
    };

    const closeModal = () => {
        setMode(null);
        setRecording(false);
    };

    const confirm = () => {
        setConfirmedText(draft.trim());
        closeModal();
    };

    return <Card title="Library 备注弹窗样例" style={{maxWidth: 720, margin: 16}}>
        <Space direction="vertical" size="middle" style={{width: "100%"}}>
            <Space wrap>
                <Button type="primary" onClick={() => openModal("add")}>打开新增备注</Button>
                <Button onClick={() => openModal("edit")}>打开编辑备注</Button>
            </Space>
            {confirmedText ? <Alert type="success" showIcon message={`最近确认：${confirmedText}`}/> : null}
        </Space>
        <Modal
            title={mode === "edit" ? "编辑备注内容" : "添加备注"}
            open={mode !== null}
            destroyOnClose={true}
            onCancel={closeModal}
            footer={(
                <Flex justify="flex-end" align="center" gap={8}>
                    <WhisperButton
                        tooltip="语音输入备注"
                        onRecordingChange={setRecording}
                        onText={(text) => setDraft((current) => appendTranscriptionText(current, text))}
                    />
                    {!recording ? (
                        <Button type="primary" disabled={!draft.trim()} onClick={confirm}>
                            确认
                        </Button>
                    ) : null}
                </Flex>
            )}
        >
            <Input.TextArea
                rows={4}
                value={draft}
                placeholder="请输入备注内容..."
                onChange={(event) => setDraft(event.target.value)}
            />
        </Modal>
    </Card>;
}

function TaskDetailEditorDebugPanel() {
    const [value, setValue] = useState("# 示例任务\n\n这是一段用于纯前端测试的备注。");

    return <Card title="任务备注编辑器" style={{width: 400, height: 520, margin: 16}}>
        <Flex vertical gap={12} style={{height: "100%"}}>
            <TaskDetailEditor value={value} onChange={setValue}/>
            <Typography.Text data-testid="task-note-value" type="secondary">
                当前值：{value}
            </Typography.Text>
        </Flex>
    </Card>;
}

const debug = <Space direction="vertical" style={{width: "100%"}}>
    <TaskDetailEditorDebugPanel/>
    <LibraryNoteModalDebugPanel/>
    <WhisperDebugPanel/>
</Space>

// const settings = {
//     init: false,
//     outUrl: 'www.intmian.com',
//     baseUrl: 'www.baidu.com',
//     realUrl: '',
// }
// const debug = <Ping
//     setting={settings}
// />

// const debug = <Timeline style={{margin: 0, padding: 0, minHeight: 0}}
//                         items={[
//                             {
//                                 children: <Typography.Text>{'创建于  ' + 1}</Typography.Text>
//                             },
//                             {
//                                 children: <Typography.Text>{'修改于  ' + 1}</Typography.Text>
//                             }
//                         ]}
// />

// const debug = <ToolPanel>
//
// </ToolPanel>

// const debug = <ToolShow
//     id={"123"}
//     name={"标题五个字"}
//     typ={ToolType.Python}
//     createdAt={"1998-56-45 00:01:02"}
//     updatedAt={"1998-56-45 00:01:02"}
//     loading={false}
// />

// const debug = <AddPermissionPanel/>

// const debug = <Space
//     direction={"vertical"}
//     size={"middle"}
//     style={{
//         width: "100%",
//     }}
// >
//     <AccountPanel
//         name="admin"
//         initShowData={accountHttp2ShowData(
//             [
//                 {
//                     token: 'admin',
//                     permission: ['admin', 'debug']
//                 },
//                 {
//                     token: 'debug',
//                     permission: ['debug']
//                 },
//                 {
//                     token: 'aaa-111',
//                     permission: ['aaa-111']
//                 },
//                 {
//                     token: 'aaa-1112323232323',
//                     permission: ['123456', '123457', '123457']
//                 },
//             ]
//             , 'admin'
//         )}
//     />
//     <AccountPanel
//         name="admin"
//         initShowData={accountHttp2ShowData(
//             [
//                 {
//                     token: 'admin',
//                     permission: ['admin', 'debug']
//                 },
//                 {
//                     token: 'debug',
//                     permission: ['debug']
//                 },
//                 {
//                     token: 'aaa-111',
//                     permission: ['aaa-111']
//                 },
//                 {
//                     token: 'aaa-1112323232323',
//                     permission: ['123456', '123457', '123457']
//                 },
//             ]
//             , 'admin'
//         )}
//     />
// </Space>

// const debug = <Index/>

function DebugTool({debug, onChange, onRefresh}) {
    const [isMinimized, setIsMinimized] = useState(true);
    const [position, setPosition] = useState({x: 800, y: 0});

    const handleMouseDown = (e) => {
        const offsetX = e.clientX - position.x;
        const offsetY = e.clientY - position.y;

        const handleMouseMove = (moveEvent) => {
            setPosition({
                x: moveEvent.clientX - offsetX,
                y: moveEvent.clientY - offsetY,
            });
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    let refreshButton = (
        <Button onClick={onRefresh} danger>
            强制刷新
        </Button>
    );

    let edit = <EditableProps reactNode={debug} onChange={onChange}/>;

    return (
        <div
            className={`floating-window ${isMinimized ? 'minimized' : ''}`}
            style={{left: position.x, top: position.y, position: 'absolute', zIndex: 9999}} // 添加 position: 'absolute'
            onMouseDown={handleMouseDown}
        >
            <div
                hidden={!isMinimized}
                style={{
                    backgroundColor: 'white',
                    padding: '5px',
                    boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
                    borderRadius: '10px',
                }}
            >
                <Text style={{userSelect: 'none'}}>debug工具</Text>
                <Button onClick={() => setIsMinimized(false)}>展开</Button>
            </div>
            <Card
                hidden={isMinimized}
                title={"组件名:" + debug.type.name}
                extra={
                    <Space>
                        {refreshButton}
                        <Button onClick={() => setIsMinimized(true)}>最小化</Button>
                    </Space>

                }
            >
                {edit}
            </Card>
        </div>
    );
}

export function Debug() {
    const [showWidth, setShowWidth] = useState(300)
    const [showHeight, setShowHeight] = useState(300)
    const [refresh, setRefresh] = useState(false)
    const [nowDebug, setNowDebug] = useState(debug)
    if (refresh) {
        // 0.05秒后刷新
        setTimeout(() => setRefresh(false), 50)
        return <></>
    }

    const debugTool = <DebugTool
        debug={debug}
        onChange={
            (props) => {
                setNowDebug({...nowDebug, props: props})
            }}
        onRefresh={
            () => {
                setRefresh(true)
            }
        }
    />

    let debugMap = new Map()
    debugMap.set('默认', <>
        {debugTool}
        {nowDebug}
    </>)
    debugMap.set('设备模拟', <>
        {debugTool}
        <DeviceSimulator>
            {nowDebug}
        </DeviceSimulator>
    </>)
    debugMap.set('自定义',
        <div>
            {debugTool}
            <Row>
                <Col span={10}>
                    <Slider min={100} max={3000} defaultValue={showWidth} onChange={setShowWidth} value={showWidth}/>
                </Col>
                <Col>
                    <InputNumber min={100} max={3000} defaultValue={showHeight} onChange={setShowWidth}
                                 value={showWidth}/>
                </Col>
            </Row>
            <Row>
                <Col span={10}>
                    <Slider min={100} max={3000} defaultValue={300} onChange={setShowHeight} value={showHeight}/>
                </Col>
                <Col>
                    <InputNumber min={100} max={3000} defaultValue={300} onChange={setShowHeight} value={showHeight}/>
                </Col>
            </Row>
            <Row>
                <CustomDeviceSimulator width={showWidth} height={showHeight}>
                    {nowDebug}
                </CustomDeviceSimulator>
            </Row>
        </div>
    )
    return <MenuPlus label2node={debugMap} baseUrl={"/debug/"}/>
}
