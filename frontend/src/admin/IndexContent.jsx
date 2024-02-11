import {Layout} from "antd";

const {Content} = Layout;

function IndexContent({contentType}) {
    if (contentType === 'monitor') {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'http://localhost:8080/monitor', true);
    } else if (contentType === 'debug') {
        return <Content
            style={{
                padding: '0 48px',
            }}
        >
            content
        </Content>;
    }
}

export default IndexContent;