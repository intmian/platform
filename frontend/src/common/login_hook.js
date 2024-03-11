import {useState} from "react";

class LoginInfo {
    constructor() {
        this.usr = null;
        this.permissions = [];
        this.lastValid = null;
    }
}

const [Loading, setLoading] = useState(false);

const [loginInfo, setLoginInfo] = useState({loading: false, showModal: false});

export function useLoginInfo() {
    return loginInfo;
}

export function SetLoginInfo(newInfo) {
    setLoginInfo(newInfo);
}

export function useLoading() {
    return Loading;
}

export function SetLoading(newLoading) {
    setLoading(newLoading);
}