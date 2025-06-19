import {useEffect, useRef} from "react";
import {useIsMobile} from "../common/hooksv2";
import {Button, Flex, message} from "antd";
import MarkdownIt from "markdown-it";
import MdEditor, {PluginComponent} from "react-markdown-editor-lite";
import 'react-markdown-editor-lite/lib/index.css';
import {UploadFile} from "../common/newSendHttp";
import {GetFile} from "../tool/tool";
import {FileAddOutlined} from "@ant-design/icons";

const mdParser = new MarkdownIt();

class FileComponent extends PluginComponent {
    // 这里定义插件名称，注意不能重复
    static pluginName = "ImageComponent";
    // 定义按钮被防止在哪个位置，默认为左侧，还可以放置在右侧（right）
    static align = "left";
    // 如果需要的话，可以在这里定义默认选项
    static defaultConfig = {
        start: 0
    };

    constructor(props) {
        super(props);

        this.handleClick = this.handleClick.bind(this);

        this.state = {
            loading: false,
        };
    }

    handleClick() {
        this.setState({loading: true});
        console.log("点击了上传文件按钮");
        GetFile(false, (file) => {
            console.log("选择的文件", file);
            if (!file) {
                console.error("没有选择文件");
                return;
            }
            UploadFile(file).then((fileShow) => {
                this.setState({loading: false});
                if (!fileShow) {
                    message.error("上传失败，请重试");
                    return;
                }
                if (fileShow.isImage) {
                    this.editor.insertText(`![${fileShow.name}](${fileShow.publishUrl})`);
                } else {
                    this.editor.insertText(`[${fileShow.name}](${fileShow.publishUrl})`);
                }
            })
        })
    }

    render() {
        return (
            <Button
                type="text"
                loading={this.state.loading}
                icon={<FileAddOutlined/>}
                onClick={this.handleClick}
                style={{marginLeft: 8}}
            />
        );
    }
}

MdEditor.use(FileComponent)

export function Editor(props: { value: string, onChange: (value: string) => void, onUpload: () => void }) {
    const editorRef = useRef<any>(null);
    const isMobile = useIsMobile();

    // 默认展示markdown渲染内容（预览模式）
    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.setView({menu: true, md: false, html: true});
        }
    }, []);

    return (
        <Flex style={{flex: 1, width: "100%", height: "100%"}} vertical>
            <MdEditor
                ref={editorRef}
                value={props.value}
                style={{
                    height: isMobile ? "70%" : "80%",
                    fontSize: isMobile ? "16px" : undefined,
                }}
                renderHTML={(text) => mdParser.render(text)}
                onChange={({text}) => props.onChange(text)}
                placeholder="任务备注"
                config={{
                    view: {
                        menu: true,
                        md: true,
                        html: true,
                    },
                    shortcuts: true,
                }}
            />
        </Flex>
    );
}
