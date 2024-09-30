import React, {useEffect, useState} from 'react';
import {Form, Input, Typography} from 'antd';

const {Text} = Typography;

export const EditableProps = ({reactNode, onChange}) => {
    const [props, setProps] = useState(reactNode.props);

    useEffect(() => {
        // 初始props传递给onChange
        onChange(props);
    }, [props]);

    const handleChange = (key, value) => {
        setProps((prevProps) => ({
            ...prevProps,
            [key]: value,
        }));
    };

    const renderEditableFields = () => {
        return Object.keys(props).map((key) => {
            const value = props[key];
            let editable = false;
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                editable = true;
            }
            return (
                <Form.Item label={`${key} (${typeof value})`} key={key}>
                    {typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? (
                        typeof value === 'boolean' ? (
                                <Input
                                    type='checkbox'
                                    checked={value}
                                    disabled={!editable}
                                    onChange={(e) => handleChange(key, e.target.checked)}
                                />
                            ) :
                            <Input
                                type={typeof value === 'number' ? 'number' : 'text'}
                                value={value}
                                disabled={!editable}
                                onChange={
                                    (e) => {
                                        if (typeof value === 'number') {
                                            handleChange(key, parseInt(e.target.value));
                                        }
                                        handleChange(key, e.target.value)
                                    }
                                }
                            />
                    ) : (
                        <Text>{String(value)}</Text>
                    )}
                </Form.Item>
            );
        });
    };


    return (
        <div style={{display: 'flex', gap: '20px'}}>
            <form>{renderEditableFields()}</form>
        </div>
    );
};