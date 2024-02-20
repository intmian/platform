import {useRef} from "react";
import {Checkbox, Input, Space} from "antd";
import {sendGetStorage} from "../common/sendhttp.js";

const {Search} = Input;

function Header(OnDataChange) {
    const useRe = useRef(false);
    const [loading, setLoading] = useState(false);
    return <Space>
        <Search placeholder="input search text"
                onSearch={
                    (value) => {
                        setLoading(true);
                        sendGetStorage(value, useRe.current, (data) => {
                            OnDataChange(data);
                            setLoading(false);
                        })
                    }
                }
                style={{width: 200}}
                loading={loading}
        />
        <Checkbox
            onChange={(choose) => {
                useRe.current = choose.target.checked;
            }}
            checked={useRe.current}
        >
            Checkbox
        </Checkbox>
    </Space>
}

export function Config() {


}