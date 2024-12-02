import React, {useCallback, useEffect, useRef, useState} from "react";
import {Button, Input, Space, Tooltip} from "antd";
import {CheckCircleTwoTone, CloseCircleTwoTone, HomeOutlined, SettingFilled, SyncOutlined} from "@ant-design/icons";
import TagInput from "../common/TagInput";

// TODO: 使用ios打开网页时，当浏览器切换到后台，立刻重新切回前台，网页并未被回收，但是浏览器会自动刷新一次，此时如果停止刷新，使用是完全正常的，似乎是底层问题后面看看

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

function SendMemosReq(url: string, key: string, content: string, tags: string[], sucCallback: () => void, failCallback: () => void) {
    let tagsStr = '';
    if (tags.length > 0) {
        // 前面加上#，然后用空格分隔
        tagsStr = '#' + tags.join(' #');
    }
    const payload = {
        content: content + '\n' + tagsStr,
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

function GetMemosTags(url: string, key: string, sucCallback: (data: any) => void, failCallback: () => void) {
    fetch(url + '/api/v1/memos/-/tags', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
    })
        .then(response => response.json())
        .then(data => {
            if (data.tagAmounts) {
                const tagsMap: MemosTagAmount = data.tagAmounts;
                const tagData: TagData[] = [];
                for (const [tag, amount] of Object.entries(tagsMap)) {
                    tagData.push({tag: tag, amount: amount});
                }
                // 在请求时根据amount排序，因为短期不会发生变化，所以不用实时更新排序，避免在底层造成性能问题。
                tagData.sort((a, b) => b.amount - a.amount);
                const tags = tagData.map((tag) => tag.tag);
                sucCallback({tags: tags});
            } else {
                failCallback();
            }
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

function MemosQueue({His}: { His: MemosReqHis[] }) {
    // 横过来排列，每个元素是一个请求的状态，移上去显示请求的内容，finish = false 时显示loading，finish = true 时显示绿色或红色的对号或叉号 icon
    const queue = [];
    for (const his of His) {
        if (his.finish) {
            if (his.success) {
                queue.push(<Tooltip key={his.id} title={his.content}><CheckCircleTwoTone
                    twoToneColor={'#52c41a'}/></Tooltip>);
            } else {
                queue.push(<Tooltip key={his.id} title={his.content}><CloseCircleTwoTone
                    twoToneColor={'#ff8b8b'}/></Tooltip>);
            }
        } else {
            queue.push(<Tooltip key={his.id} title={his.content}>
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
        GetMemosTags(setting.url, setting.key, (data) => {
            tagsOpr.current = data.tags;
            localStorage.setItem('memosTags', JSON.stringify(tagsOpr.current));
        }, () => {
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

function Memos() {
    // 从localStorage中获取配置
    const memosSetting: MemosSetting = JSON.parse(localStorage.getItem('memosSetting') || '{}');
    const NowSetting = useRef(memosSetting);
    // 如果没有配置，需要用户输入，并设置到localStorage
    if (!memosSetting.url || !memosSetting.key) {
        let url = prompt('请输入备忘录的URL');
        // 如果url不为空，且未包含http，默认在前面补全https://。
        if (url && !url.includes('http')) {
            url = 'https://' + url;
        }
        const key = prompt('请输入备忘录的KEY');
        if (NowSetting.current) {
            if (url) {
                NowSetting.current.url = url;
            }
            if (key) {
                NowSetting.current.key = key;
            }
        } else {
            NowSetting.current = {url: url || '', key: key || ''};
        }
        localStorage.setItem('memosSetting', JSON.stringify(NowSetting.current));
    }

    const setUrlButton = <Button
        size={"small"}
        shape={"circle"}
        icon={<HomeOutlined/>}
        onClick={() => {
            const url = prompt('请输入备忘录的URL');
            if (url) {
                NowSetting.current.url = url;
            }
            localStorage.setItem('memosSetting', JSON.stringify(NowSetting.current));
        }}/>;

    const setKeyButton = <Button
        size={"small"}
        shape={"circle"}
        icon={<SettingFilled/>}

        onClick={() => {
            const key = prompt('请输入备忘录的KEY');
            if (key) {
                NowSetting.current.key = key;
            }
            localStorage.setItem('memosSetting', JSON.stringify(NowSetting.current));
        }}/>;

    // TODO: 重构此处，优化下这个组件频繁重绘的问题。
    const [inputText, setInputText] = useState('');
    const [inputHidden, setInputHidden] = useState('');
    const [hidden, setHidden] = useState<boolean>(false);
    const inputRef = useRef(null);
    const input = <TextArea
        ref={inputRef}
        autoFocus
        style={{
            marginBottom: '10px',
            // 自动填充剩余空间
            flexGrow: 1,
            fontSize: '16px',
        }}
        value={inputText} onChange={(e) => setInputText(e.target.value)}
        // 提示 enter换行 ctrl+enter发送
        placeholder={'Enter换行\nCtrl+Enter发送\ntab切换标签输入'}
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

    // 生成一个随机数，从0开始也行，主要是内网调试的时候，避免出现重复的id
    const tempId = Math.floor(Math.random() * 1000000);
    const [lastReqId, setLastReqId] = useState<number>(tempId);
    const [tagsSelected, setTagsSelected] = useState<string[]>([]);

    const submit = useCallback(() => {
        let realText = '';
        if (hidden) {
            let starCount = 0;
            for (let i = 0; i < inputText.length; i++) {
                if (inputText[i] === '*') {
                    starCount++;
                } else {
                    break;
                }
            }
            realText = inputHidden.slice(0, starCount) + inputText.slice(starCount)
        } else {
            realText = inputText;
        }
        AddHis(realText);
        const id = lastReqId;
        SendMemosReq(NowSetting.current.url, NowSetting.current.key, realText, tagsSelected, () => {
            SetHis(id, true, true);
        }, () => {
            SetHis(id, true, false);
        });
        setInputText('');
        setInputHidden('');
        setLastReqId(lastReqId + 1);
        setHidden(false);
        setTagsSelected([]);
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [AddHis]);

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
    return <div
        style={{
            // 绝对定位
            position: "absolute",
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
                width: "400px",
                height: "400px",
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
                        // 垂直居中
                        alignItems: 'center',
                        width: '15%',
                        height: '100%',
                    }}
                >
                    {setUrlButton}
                    {setKeyButton}
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
                    setting={NowSetting.current}
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
                    }}>{
                        hidden ? '显示' : '隐藏'
                    }</Button>
                    <Button
                        type="primary"
                        disabled={NowSetting.current.url === '' || NowSetting.current.key === '' || (inputText === '' && inputHidden === '')}
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