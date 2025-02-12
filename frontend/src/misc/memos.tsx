import React, {useCallback, useContext, useEffect, useImperativeHandle, useRef, useState} from "react";
import {Button, Input, Modal, notification, Space, Spin, Tooltip} from "antd";
import {CheckCircleTwoTone, CloseCircleTwoTone, SettingFilled, SyncOutlined} from "@ant-design/icons";
import TagInput from "../common/TagInput";
import {useLostFocus} from "../common/hook";
import {sendCfgServiceGet, sendCfgServiceSet} from "../common/sendhttp";
import {TextAreaRef} from "antd/es/input/TextArea";
import {useIsMobile} from "../common/hooksv2";
import User from "../common/User";
import {LoginCtx} from "../common/loginCtx";

// TODO: 使用ios打开网页时，当浏览器切换到后台，立刻重新切回前台，网页并未被回收，但是浏览器会自动刷新一次，此时如果停止刷新，使用是完全正常的，似乎是底层问题后面看看

const {TextArea} = Input;

interface MemosSetting {
    url: string
    key: string
}

function SettingPanel({onSuccess, onFail}: { onSuccess: (setting: MemosSetting) => void, onFail: () => void }) {
    const [url, setUrl] = useState('');
    const [key, setKey] = useState('');

    return <Modal
        title="配置"
        open={true}

        okText={"确定"}
        cancelText={"取消"}

        width={300}

        onOk={() => {
            if (url && key) {
                sendCfgServiceSet('note', "setting", JSON.stringify({url: url, key: key}), (result: {
                    ok: boolean;
                }) => {
                    if (result.ok) {
                        onSuccess({url: url, key: key});
                    } else {
                        onFail();
                    }
                });
            } else {
                onFail();
            }
        }}
        onCancel={onFail}
    >
        <Input
            placeholder="URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{marginBottom: '10px', width: '100%'}}
        />
        <Input
            placeholder="KEY"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            style={{marginBottom: '10px', width: '100%'}}

        />
    </Modal>
}

interface MemosReqStatus {
    finish: boolean
    success: boolean
}

interface MemosReq {
    content: string
    tags: string[]
    id: number
}

let lastSendTime: Date | null = null;

function SendMemosReq(url: string, key: string, content: string, tags: string[], sucCallback: () => void, failCallback: () => void) {
    // 一秒内不允许连续发送
    if (lastSendTime && new Date().getTime() - lastSendTime.getTime() < 1000) {
        confirm('发送过于频繁，请稍后再试');
        failCallback();
        return;
    } else {
        lastSendTime = new Date();
    }

    let tagsStr = '';
    if (tags.length > 0) {
        // 前面加上#，然后用空格分隔
        tagsStr = '#' + tags.join(' #');
    }
    const payload = {
        content: content + '\n' + tagsStr,
        visibility: "PRIVATE",
    };

    // 设置超时时间
    const timeout = 5000;
    // 使用AbortController来控制请求超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    fetch(url + '/api/v1/memos', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
    })
        .then(response => {
            // 清除超时定时器
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // 如果data里面有content，说明成功了
            if (data.content) {
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

interface MemosTagAmount {
    tagAmounts: Map<string, number>
}

interface TagData {
    tag: string
    amount: number
}

function GetMemosTags(url: string, key: string, sucCallback: (data: {
    tags: string[]
}) => void, failCallback: () => void) {
    // 这个项目相当的神奇，tags没有单独存储，而是加载所有的笔记，从笔记中读取关联的tags…tags只计算在这里，两万条大概800k
    fetch(url + '/api/v1/users/1/stats', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
    })
        .then(response => response.json())
        .then(data => {
            const tag2num = new Map(Object.entries(data.tagCount));
            const tagData: TagData[] = [];
            tag2num.forEach((value, key) => {
                tagData.push({tag: key, amount: value});
            });
            tagData.sort((a, b) => b.amount - a.amount);
            const tags = tagData.map((tag) => tag.tag);
            sucCallback({tags: tags});
        })
}

// function GetMemosReq(url: string, key: string, sucCallback: (data: any) => void, failCallback: () => void) {
//     fetch(url, {
//         method: 'GET',
//         headers: {
//             'Content-Type': 'application/json',
//             'Authorization': `Bearer ${key}`
//         },
//     })
//         .then(response => response.json())
//         .then(data => {
//             if (data.success) {
//                 sucCallback(data);
//             } else {
//                 failCallback();
//             }
//         })
//         .catch(error => {
//             console.error('Error:', error);
//             failCallback();
//         });
// }

function MemosQueue({reqs, url, apiKey}: { reqs: MemosReq[], url: string, apiKey: string }) {
    const [reqHisMap, setReqHisMap] = useState(new Map<number, MemosReqStatus>());
    const saveReqHisMap = (id: number, status: MemosReqStatus) => {
        const newMap = new Map(reqHisMap);
        newMap.set(id, status);
        setReqHisMap(newMap);
    };
    // 横过来排列，每个元素是一个请求的状态，移上去显示请求的内容，finish = false 时显示loading，finish = true 时显示绿色或红色的对号或叉号 icon
    // 当发生变化时重新刷新显示。
    const queue = [];
    for (const req of reqs) {
        // 读取状态，如果没有就新建一个
        const id = req.id;
        let noFind = false;
        if (!reqHisMap.has(id)) {
            noFind = true;
            reqHisMap.set(id, {finish: false, success: false});
        }
        const reqStatus = reqHisMap.get(id);
        if (!reqStatus) {
            continue;
        }

        // 没有就新建
        if (noFind) {
            saveReqHisMap(id, {finish: false, success: false});
            SendMemosReq(url, apiKey, req.content, req.tags, () => {
                saveReqHisMap(id, {finish: true, success: true});
            }, () => {
                saveReqHisMap(id, {finish: true, success: false});
            });
        }

        const realText = req.content + (req.tags.length > 0 ? '\n #' + req.tags.join(' #') : '');

        if (reqStatus.finish) {
            if (reqStatus.success) {
                queue.push(<Tooltip key={req.id} title={realText}><CheckCircleTwoTone
                    twoToneColor={'#52c41a'}/></Tooltip>);
            } else {
                // 点击叉号重新发送，更改状态
                queue.push(
                    <CloseCircleTwoTone
                        twoToneColor={'#ff8b8b'}
                        key={req.id} title={realText}
                        onClick={() => {
                            SendMemosReq(url, apiKey, req.content, req.tags, () => {
                                    saveReqHisMap(id, {finish: true, success: true,});
                                }, () => {
                                    saveReqHisMap(id, {finish: true, success: false});
                                }
                            );
                            saveReqHisMap(id, {finish: false, success: false});
                        }}
                    />
                );
            }
        } else {
            queue.push(<Tooltip key={req.id} title={realText}>
                <SyncOutlined style={{color: 'orange'}} spin/>
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

function Tags({TagsChange, setting, style, tags}: {
    TagsChange: (tags: string[]) => void,
    setting: MemosSetting,
    style: React.CSSProperties | undefined,
    tags: string[]
}) {
    // 从localStorage中获取之前缓存的tags
    const tagsOprDisk = JSON.parse(localStorage.getItem('memosTags') || '[]');
    const tagsOpr: { current: string[] } = useRef(tagsOprDisk);
    useEffect(() => {
        if (setting.url === '' || setting.key === '') {
            return;
        }
        GetMemosTags(setting.url, setting.key, (data) => {
            tagsOpr.current = data.tags;
            localStorage.setItem('memosTags', JSON.stringify(tagsOpr.current));
        }, () => {
            notification.error({
                message: '错误',
                description: '获取tags失败',
            });
        });
    }, [setting.url, setting.key, TagsChange]);
    return <TagInput
        onChange={(tags: string[]) => {
            TagsChange(tags);
        }}
        tags={tags}
        style={style} tagOps={tagsOpr.current}
        disabled={false} maxTagCount={undefined} maxTagTextLength={undefined}
        maxTagPlaceholder={undefined}
    />
}


// HideInput 用于输入并展示当前输入的内容，如果隐藏的模式下会对展示数据进行隐藏，ref用于清空，获得内容，触发隐藏逻辑等。
function HideInput({
                       functionsRef,
                       style,
                       onChange
                   }: {
    functionsRef: React.MutableRefObject<{
        clear: () => void,
        get: () => string,
        hide: () => void,
        show: () => void,
        focus: () => void,
    }>,
    style: React.CSSProperties,
    onChange: (text: string) => void
}) {
    // 目前显示的内容，输入的内容也同步在这里
    const [showText, setShowText] = useState('');
    // 隐藏的内容
    const hideTextRef: React.MutableRefObject<string> = useRef('');
    const inputRef: React.RefObject<TextAreaRef> = useRef(null);

    // 从浏览器缓存加载数据
    useEffect(() => {
        const cachedInput = localStorage.getItem('note.lastInput');
        if (cachedInput) {
            setShowText(cachedInput);
        }
    }, []);

    // 实时保存输入框的内容到浏览器缓存
    useEffect(() => {
        if (showText !== '') {
            localStorage.setItem('note.lastInput', get());
        }
    }, [showText]);

    // 给父组件提供的方法
    const clear = useCallback(() => {
        setShowText('');
        hideTextRef.current = '';
        localStorage.removeItem('note.lastInput'); // 清空缓存
    }, []);

    const get = useCallback(() => {
        // 将inputHidden提取input中剩余的前缀*数放在前面，input中*后的内容放在后面.
        let starCount = 0;
        for (let i = 0; i < showText.length; i++) {
            if (showText[i] === '*') {
                starCount++;
            } else {
                break;
            }
        }
        return hideTextRef.current.slice(0, starCount) + showText.slice(starCount);
    }, [showText]);

    const hide = useCallback(() => {
        hideTextRef.current = showText;
        setShowText('*'.repeat(showText.length));
    }, [showText]);

    const show = useCallback(() => {
        let starCount = 0;
        for (let i = 0; i < showText.length; i++) {
            if (showText[i] === '*') {
                starCount++;
            } else {
                break;
            }
        }
        setShowText(hideTextRef.current.slice(0, starCount) + showText.slice(starCount));
    }, [showText]);

    const focus = useCallback(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    useImperativeHandle(functionsRef, () => ({
        clear,
        get,
        hide,
        show,
        focus,
    }), [clear, focus, get, hide, show]);

    useEffect(() => {
        onChange(get());
    }, [get, onChange, showText]);

    return (
        <TextArea
            ref={inputRef}
            autoFocus
            style={style}
            value={showText}
            onChange={(e) => setShowText(e.target.value)}
            placeholder={'Enter换行\nCtrl+Enter发送\ntab切换标签输入'}
        />
    );
}


function Memos() {
    const [loadingUser, setLoadingUser] = useState(true);
    const [loadingSetting, setLoadingSetting] = useState(true);
    const [openSetting, setOpenSetting] = useState(false);
    const [hidden, setHidden] = useState(false);
    const isMobile = useIsMobile();
    // 更换Favicon为/newslogo.webp
    useEffect(() => {
        const existingFavicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
        if (existingFavicon) {
            existingFavicon.remove();
        }

        const link = document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = '/note-logo-mini.png';
        document.getElementsByTagName('head')[0].appendChild(link);
        document.title = "mini笔记";
    }, []);

    // 从localStorage中获取配置
    const loginCtr = useContext(LoginCtx);
    const [NowSetting, setNowSetting] = useState<MemosSetting>({url: '', key: ''});
    useEffect(() => {
        if (loginCtr.loginInfo.usr === "") {
            setLoadingUser(false);
            return;
        }
        sendCfgServiceGet("note", (ret: any) => {
            if (ret.ok && ret.data && ret.data['note.setting']) {
                const setting = JSON.parse(ret.data['note.setting'].Data);
                setNowSetting(setting);
            } else {
                setNowSetting({url: '', key: ''});
                setOpenSetting(true);
            }
            setLoadingSetting(false);
            setLoadingUser(false);
        })
    }, [loginCtr.loginInfo.usr]);

    const setButton = <Button
        size={"small"}
        shape={"circle"}
        icon={<SettingFilled/>}
        loading={loadingSetting}
        onClick={() => {
            setOpenSetting(true);
        }}/>;

    const inputRef: React.MutableRefObject<{
        clear: () => void;
        get: () => string;
        hide: () => void;
        show: () => void;
        focus: () => void
    }> = useRef({
        clear: () => {
        },
        get: () => '',
        hide: () => {
        },
        show: () => {
        },
        focus: () => {
        },
    });
    const [canSubmit, setCanSubmit] = useState(false);
    const input = <HideInput functionsRef={inputRef}
                             style={{
                                 marginBottom: '10px',
                                 // 自动填充剩余空间
                                 flexGrow: 1,
                                 fontSize: '16px',
                             }}
                             onChange={(text) => {
                                 // 当输入框内容发生变化时，检查是否可以发送，这样可以减少刷新次数
                                 setCanSubmit(NowSetting.url !== '' && NowSetting.key !== '' && text !== '');
                             }}
    />


    useLostFocus(() => {
        if (inputRef.current.get() !== '' && !hidden) {
            inputRef.current.focus();
            setHidden(true);
            inputRef.current.hide();
        }
    });

    // 生成一个随机数，从0开始也行，主要是内网调试的时候，避免出现重复的id
    const tempId = Math.floor(Math.random() * 1000000);
    const [lastReqId, setLastReqId] = useState<number>(tempId);

    const [reqHis, setReqHis] = useState<MemosReq[]>([]);
    const reqHisNow = useRef(reqHis);
    const AddHis = useCallback((content: string, tags: string[]) => {
        reqHisNow.current = [{
            content: content,
            tags: tags,
            id: lastReqId
        }, ...reqHis];
        if (reqHisNow.current.length > 8) {
            reqHisNow.current.pop();
        }
        setReqHis(reqHisNow.current);
    }, [lastReqId, reqHis]);
    const [tagsSelected, setTagsSelected] = useState<string[]>([]);

    const submit = useCallback(() => {
        const realText = inputRef.current.get();
        AddHis(realText, tagsSelected);
        inputRef.current.clear();
        setLastReqId(lastReqId + 1);
        setHidden(false);
        setTagsSelected([]);
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [AddHis, lastReqId, tagsSelected]);

    // ctrl+enter发送
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.stopPropagation();
                submit();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [submit]);

    const tagsChange = useCallback((tags: string[]) => {
        setTagsSelected(tags);
    }, []);

    if (loadingUser) {
        return <Spin size="large"
                     style={{
                         display: 'flex',
                         justifyContent: 'center',
                         alignItems: 'center',
                         height: '100vh',
                     }}
        />;
    }

    return <div
        style={{
            // 绝对定位
            position: "absolute",
            width: "100%",
            height: "100%",
            // 居中
            display: "flex",  // 开启弹性盒
            justifyContent: "center",  //使子元素在主轴上居中
            alignItems: !isMobile ? "center" : "flex-start",  	//使子元素在侧轴进行居中
            // 背景
            backgroundColor: '#f5f5f5',
        }}
    >
        {openSetting ? <SettingPanel
            onSuccess={(setting: MemosSetting) => {
                setNowSetting(setting);
                setOpenSetting(false);
            }}
            onFail={() => {
                notification.error({
                    message: '错误',
                    description: '设置失败',
                });
                setOpenSetting(false);
            }}/> : null
        }
        <div
            style={{
                width: "400px",
                height: isMobile ? "300px" : "400px",
                margin: "20px",
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
                    marginBottom: '10px',
                }}
            >
                <div
                    style={{
                        width: '80%',
                        marginRight: '10px',
                    }}
                >
                    <MemosQueue
                        reqs={reqHis}
                        url={NowSetting.url}
                        apiKey={NowSetting.key}
                    />
                </div>
                <Space
                    style={{
                        // 子组件靠右
                        display: 'flex',
                        justifyContent: 'flex-end',
                        // 垂直居中
                        alignItems: 'center',
                        width: '20%',
                        height: '100%',
                    }}
                >
                    <User/>
                    {setButton}
                </Space>
            </div>
            {input}
            <div
                style={{
                    display: 'flex',
                }}
            >
                <Tags
                    TagsChange={tagsChange}
                    tags={tagsSelected}
                    setting={NowSetting}
                    style={{
                        // 宽度自动填充
                        flexGrow: 1,
                        marginRight: '10px',
                    }}/>
                <Space
                    style={{
                        // 子组件靠右
                        display: 'flex',
                        justifyContent: 'flex-end',
                    }}
                >
                    <Button onClick={() => {
                        if (!hidden) {
                            inputRef.current.hide();
                        } else {
                            inputRef.current.show();
                        }
                        setHidden(!hidden)
                    }}>{
                        hidden ? '显示' : '隐藏'
                    }</Button>
                    <Button
                        type="primary"
                        disabled={!canSubmit || loadingSetting}
                        onClick={submit}
                    >
                        发送
                    </Button>
                </Space>
            </div>
        </div>
    </div>
}

export default Memos;