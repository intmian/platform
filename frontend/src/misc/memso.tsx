import {useRef, useState} from "react";
import {Button, Input, Space, Tooltip} from "antd";
import {CheckCircleTwoTone, CloseCircleTwoTone, HomeOutlined, SettingFilled, SyncOutlined} from "@ant-design/icons";

const {TextArea} = Input;

interface MemosSetting {
    url: string
    key: string
}

interface MemosReqHis {
    content: string
    finish: boolean
    success: boolean
    id: number
}

function SendMemosReq(url: string, key: string, content: string, sucCallback: () => void, failCallback: () => void) {
    const payload = {
        content: content,
        visibility: "PRIVATE",
    };

    fetch(url + '/api/v1/memos', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(payload)
    })
        .then(response => response.json())
        .then(data => {
            // 如果data里面有content，说明成功了
            if (data.content && data.content === content) {
                sucCallback();
            } else {
                failCallback();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            failCallback();
        });
}

function GetMemosReq(url: string, key: string, sucCallback: (data: any) => void, failCallback: () => void) {
    fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                sucCallback(data);
            } else {
                failCallback();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            failCallback();
        });
}

function MemosQueue({His}: { His: MemosReqHis[] }) {
    // 横过来排列，每个元素是一个请求的状态，移上去显示请求的内容，finish = false 时显示loading，finish = true 时显示绿色或红色的对号或叉号 icon
    const queue = [];
    for (const his of His) {
        if (his.finish) {
            if (his.success) {
                queue.push(<Tooltip key={his.content} title={his.content}><CheckCircleTwoTone
                    twoToneColor={'#52c41a'}/></Tooltip>);
            } else {
                queue.push(<Tooltip key={his.content} title={his.content}><CloseCircleTwoTone
                    twoToneColor={'#eb2f96'}/></Tooltip>);
            }
        } else {
            queue.push(<Tooltip key={his.content} title={his.content}>
                <SyncOutlined spin/>
            </Tooltip>);
        }
    }
    return <Space
        style={{
            // 圆角虚线框
            border: '1px dashed',
            borderRadius: '10px',
            padding: '2px',
            width: '100%',
            boxSizing: 'border-box',
            paddingLeft: '5px',
            paddingRight: '5px',
        }}
    >
        {queue}
    </Space>;
}

function Memos() {
    // 从localStorage中获取配置
    const memosSetting: MemosSetting = JSON.parse(localStorage.getItem('memosSetting') || '{}');
    const NowSetting = useRef(memosSetting);
    // 如果没有配置，需要用户输入，并设置到localStorage
    if (!memosSetting.url || !memosSetting.key) {
        const url = prompt('请输入备忘录的URL');
        const key = prompt('请输入备忘录的KEY');
        NowSetting.current = {url: url || '', key: key || ''};
        localStorage.setItem('memosSetting', JSON.stringify(NowSetting.current));
    }

    const setUrlButton = <Button
        size={"small"}
        shape={"circle"}
        icon={<HomeOutlined/>}
        onClick={() => {
            const url = prompt('请输入备忘录的URL');
            NowSetting.current.url = url || '';
            localStorage.setItem('memosSetting', JSON.stringify(NowSetting.current));
        }}/>;

    const setKeyButton = <Button
        size={"small"}
        shape={"circle"}
        icon={<SettingFilled/>}

        onClick={() => {
            const key = prompt('请输入备忘录的KEY');
            NowSetting.current.key = key || '';
            localStorage.setItem('memosSetting', JSON.stringify(NowSetting.current));
        }}/>;

    const [inputText, setInputText] = useState('');
    const [inputHidden, setInputHidden] = useState('');
    const [hidden, setHidden] = useState<boolean>(false);
    const input = <TextArea
        style={{
            marginBottom: '10px',
            // 自动填充剩余空间
            flexGrow: 1,
        }}
        value={inputText} onChange={(e) => setInputText(e.target.value)}
        // ctrl+enter发送
        onPressEnter={(e) => {
            if (e.ctrlKey) {
                submit();
            }
        }}
    />;

    const [reqHis, setReqHis] = useState<MemosReqHis[]>([]);
    const reqHisNow = useRef(reqHis);
    const AddHis = (content: string) => {
        reqHisNow.current = [{content: content, finish: false, success: true, id: lastReqId}, ...reqHis];
        if (reqHisNow.current.length > 10) {
            reqHisNow.current.pop();
        }
        setReqHis(reqHisNow.current);
    };
    const SetHis = (id: number, finish: boolean, success: boolean) => {
        reqHisNow.current = reqHisNow.current.map((his) => {
            if (his.id === id) {
                return {content: his.content, finish: finish, success: success, id: his.id};
            } else {
                return his;
            }
        });
        setReqHis(reqHisNow.current);
    }

    const [lastReqId, setLastReqId] = useState<number>(0);


    const submit = () => {
        AddHis(inputText);
        const id = lastReqId;
        SendMemosReq(NowSetting.current.url, NowSetting.current.key, inputText, () => {
            SetHis(id, true, true);
        }, () => {
            SetHis(id, true, false);
        });
        setInputText('');
        setInputHidden('');
        setLastReqId(lastReqId + 1);
    };
    return <div
        style={{
            width: "100%",
            height: "100%",
            // 居中
            display: "flex",  // 开启弹性盒
            justifyContent: "center",//使子元素在主轴居中
            alignItems: "center",  	//使子元素在侧轴进行居中
            // 背景
            backgroundColor: '#f5f5f5',
        }}
    >
        <div
            style={{
                width: "500px",
                height: "500px",
                margin: "5px",
                // 卡片边框阴影
                backgroundColor: 'white',
                boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)',
                // 圆角
                borderRadius: '10px',
                padding: '20px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div
                style={{
                    display: 'flex',
                }}
            >
                <div
                    style={{
                        width: '90%',
                        marginRight: '10px',
                    }}
                >
                    <MemosQueue His={reqHis}/>
                </div>
                <Space
                    style={{
                        // 子组件靠右
                        display: 'flex',
                        justifyContent: 'flex-end',
                        marginBottom: '10px',
                        width: '15%',
                    }}
                >
                    {setUrlButton}
                    {setKeyButton}
                </Space>
            </div>

            {input}
            <Space
                style={{
                    // 子组件靠右
                    display: 'flex',
                    justifyContent: 'flex-end',
                }}
            >
                <Button onClick={() => {
                    if (!hidden) {
                        // 将当前内容保存到隐藏的input中，并将inputText全部变成*
                        setInputHidden(inputText);
                        setInputText('*'.repeat(inputText.length));
                    } else {
                        // 将inputhidden提取input中剩余的前缀*数放在前面，input中*后的内容放在后面.
                        let starCount = 0;
                        for (let i = 0; i < inputText.length; i++) {
                            if (inputText[i] === '*') {
                                starCount++;
                            } else {
                                break;
                            }
                        }
                        setInputText(inputHidden.slice(0, starCount) + inputText.slice(starCount));
                    }
                    setHidden(!hidden)
                }}>显示/隐藏</Button>
                <Tooltip title="Enter换行 Ctrl+Enter发送">
                    <Button
                        type="primary"
                        disabled={NowSetting.current.url === '' || NowSetting.current.key === '' || hidden}
                        onClick={submit}
                    >
                        发送
                    </Button>
                </Tooltip>
            </Space>
        </div>
    </div>
}

export default Memos;