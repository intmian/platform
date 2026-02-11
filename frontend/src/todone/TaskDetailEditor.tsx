import {useEffect, useRef} from "react";
import {useIsMobile} from "../common/hooksv2";
import {Button, Flex, message} from "antd";
import MarkdownIt from "markdown-it";
import MdEditor, {PluginComponent} from "react-markdown-editor-lite";
import 'react-markdown-editor-lite/lib/index.css';
import {FileAddOutlined} from "@ant-design/icons";
import {useImageUpload} from "../common/useImageUpload";

const mdParser = new MarkdownIt();

// 定义一个函数式组件来使用 Hook
function UploadButton(props: { editor: any }) {
    const {uploading, checkClipboard} = useImageUpload((fileShow) => {
        if (fileShow.isImage) {
            props.editor.insertText(`![${fileShow.name}](${fileShow.publishUrl})`);
        } else {
            props.editor.insertText(`[${fileShow.name}](${fileShow.publishUrl})`);
        }
    });

    return (
        <Button
            type="text"
            loading={uploading}
            icon={<FileAddOutlined/>}
            onClick={() => checkClipboard(false)} // false 表示不自动上传，会询问用户；取消则打开文件选择
            style={{marginLeft: 8}}
        />
    );
}

class FileComponent extends PluginComponent {
    // 这里定义插件名称，注意不能重复
    static pluginName = "ImageComponent";
    // 定义按钮被防止在哪个位置，默认为左侧，还可以放置在右侧（right）
    static align = "left";
    // 如果需要的话，可以在这里定义默认选项
    static defaultConfig = {
        start: 0
    };

    render() {
        return <UploadButton editor={this.editor}/>;
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
