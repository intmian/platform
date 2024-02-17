import {Button, Form, Input, message, Modal} from "antd";
import {useState} from "react";

async function sendLogin(values) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(values),
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const result = await response.json();
        if (result.code === 0) {
            return result.username
        } else {
            return ''
        }
    } catch (error) {
        return ''
    }
}


export default function Login({onLoginSuc, onCancel}) {
    console.log("onLoginSuc:", onLoginSuc);
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
                onFinish={async (values) => {
                    setLoading(true);
                    let result = await sendLogin(values);
                    setLoading(false);
                    console.log("result:", result);
                    if (result !== '') {
                        setShowModal(false);
                        onLoginSuc(result);
                    } else {
                        message.error('用户名或密码错误');
                    }
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