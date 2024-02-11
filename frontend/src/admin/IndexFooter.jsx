import {Layout} from "antd";

const {Footer} = Layout;

function IndexFooter() {
    return <Footer
        style={{
            textAlign: 'center',
        }}
    >
        mian ©{new Date().getFullYear()} Created by mian@github
    </Footer>;
}

export default IndexFooter;