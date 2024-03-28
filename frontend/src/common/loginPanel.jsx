import {Button, Form, Input, message, Modal} from "antd";
import {useState} from "react";
import {sendLogin} from "./sendhttp.js";


export default function LoginPanel({onLoginSuc, onCancel}) {
    let labelCol = 4;
    let wrapperCol = 8;
    const [showModal, setShowModal] = useState('true');
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    return (
        <Modal
            title="登陆"
            open={showModal}
            footer={null}
            style={{
                maxWidth: 450,
            }}
            onCancel={() => {
                setShowModal(false);
                onCancel();
            }}
        >
            <Form
                name="basic"
                labelCol={{
                    span: labelCol,
                }}
                // wrapperCol={{
                //     span: wrapperCol,
                // }}
                style={{}}
                initialValues={{
                    remember: true,
                }}
                onFinish={(values) => {
                    setLoading(true);
                    sendLogin(values, (result) => {
                        setLoading(false);
                        if (result !== '' && result.code === 0) {
                            setShowModal(false);
                            onLoginSuc(result.data);
                        } else {
                            message.error('用户名或密码错误');
                        }
                    });
                }}
                autoComplete="off"
                form={form}
                action={'/api/login'}
            >
                <Form.Item
                    label="用户名"
                    name="username"
                    rules={[
                        {
                            required: true,
                            message: '请输入用户名!',
                        },
                    ]}
                    style={
                        {}
                    }
                >
                    <Input/>
                </Form.Item>

                <Form.Item
                    label="密码"
                    name="password"
                    rules={[
                        {
                            required: true,
                            message: '请输入密码!',
                        },
                    ]}
                    style={
                        {}
                    }
                >
                    <Input.Password/>
                </Form.Item>

                <Form.Item
                    wrapperCol={{
                        offset: labelCol,
                        span: wrapperCol,
                    }}
                >
                    <Button type="primary" htmlType="submit" loading={loading}>
                        提交
                    </Button>
                </Form.Item>
            </Form>
        </Modal>
    )
}