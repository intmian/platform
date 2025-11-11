import React from 'react';
import {Typography} from 'antd';

const {Paragraph} = Typography;

function Paragraphs(props) {
    const {children, ...restProps} = props;

    // children可能是字符串，也可能是React节点
    if (typeof children !== 'string') {
        // 不是字符串，直接原样渲染一个Paragraph
        return <Paragraph {...restProps}>{children}</Paragraph>;
    }

    // 是字符串，按换行符拆分成数组
    // 这里兼容 \r\n 和 \n
    const lines = children.split(/\r?\n/).filter(line => line.trim() !== '');

    return (
        <>
            {lines.map((line, idx) => (
                <Paragraph key={idx} {...restProps}
                           style={{marginBottom: 6}}
                >
                    {line}
                </Paragraph>
            ))}
        </>
    );
}

export default Paragraphs;
