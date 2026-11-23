import {Route, Routes} from "react-router-dom";
import {LegacyGroupRedirect, Todone} from "./Main";

// 地址规则见 route.ts：/todone 是关注，/todone/g/<id> 是分组，其余单段地址按旧格式转过去
export default function TodoneApp() {
    return <Routes>
        <Route index element={<Todone/>}/>
        <Route path="g/:groupId" element={<Todone/>}/>
        <Route path=":legacy" element={<LegacyGroupRedirect/>}/>
    </Routes>;
}
