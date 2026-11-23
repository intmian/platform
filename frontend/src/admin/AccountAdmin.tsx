import {useEffect, useState} from "react";
import {Button, Card, Empty, Flex, Input, message, Modal, Popconfirm, Space, Spin, Tooltip, Typography} from "antd";
import {CloseOutlined, DeleteOutlined, PlusOutlined, SaveOutlined} from "@ant-design/icons";
import TagInput from "../common/TagInput";
import {AllPermission} from "../common/def";
import {useIsMobile} from "../common/breakpoints";
import {
    AccountTokens,
    changeToken,
    createToken,
    deleteToken,
    deregisterAccount,
    getAllAccounts,
    registerAccount,
} from "./adminApi";

// 一个账号可以有多个密码（token），每个密码单独配权限
interface TokenData {
    tokenID: string;
    permission: string[];
}

interface AccountData {
    name: string;
    tokens: TokenData[];
}

function toAccount(name: string, tokens: AccountTokens): AccountData {
    return {
        name,
        tokens: Object.entries(tokens).map(([tokenID, permission]) => ({tokenID, permission: permission ?? []})),
    };
}

function errText(e: unknown): string {
    return e instanceof Error && e.message ? `：${e.message}` : "";
}

function AddTokenModal({account, onAdd, onCancel}: {
    account: string;
    onAdd: (token: TokenData) => void;
    onCancel: () => void;
}) {
    const [pwd, setPwd] = useState("");
    const [permissions, setPermissions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        setLoading(true);
        try {
            const tokenID = await createToken(account, pwd, permissions);
            message.success("已添加");
            onAdd({tokenID, permission: permissions});
        } catch (e) {
            message.error("添加失败" + errText(e));
        } finally {
            setLoading(false);
        }
    };

    return <Modal
        open
        title={`给 ${account} 添加密码`}
        onCancel={onCancel}
        okButtonProps={{loading, disabled: pwd === ""}}
        onOk={() => void submit()}
        okText="添加"
        cancelText="取消"
    >
        <Space direction="vertical" size="middle" style={{width: "100%"}}>
            <Input.Password placeholder="密码" value={pwd} onChange={(e) => setPwd(e.target.value)}/>
            <TagInput tagOps={AllPermission} tags={permissions} onChange={setPermissions} tips="选择权限" style={{width: "100%"}}/>
        </Space>
    </Modal>;
}

function TokenRow({account, token, onDeleted}: {
    account: string;
    token: TokenData;
    onDeleted: () => void;
}) {
    const [permission, setPermission] = useState(token.permission);
    const [savedPermission, setSavedPermission] = useState(token.permission);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const changed = JSON.stringify(permission) !== JSON.stringify(savedPermission);

    const save = async () => {
        setSaving(true);
        try {
            await changeToken(account, token.tokenID, permission);
            setSavedPermission(permission);
            message.success("已保存");
        } catch (e) {
            message.error("保存失败" + errText(e));
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        setDeleting(true);
        try {
            await deleteToken(account, token.tokenID);
            message.success("已删除");
            onDeleted();
        } catch (e) {
            message.error("删除失败" + errText(e));
            setDeleting(false);
        }
    };

    return <Flex gap={8} align="center" wrap="wrap">
        <Tooltip title={token.tokenID}>
            <Typography.Text type="secondary" ellipsis style={{width: 72, fontFamily: "monospace", fontSize: 12}}>
                {token.tokenID}
            </Typography.Text>
        </Tooltip>
        <div style={{flex: 1, minWidth: 160}}>
            <TagInput
                tagOps={AllPermission}
                tags={permission}
                onChange={setPermission}
                tips="选择权限"
                style={{width: "100%"}}
                maxTagCount="responsive"
            />
        </div>
        <Space size={4}>
            <Tooltip title="保存">
                <Button size="small" type="primary" icon={<SaveOutlined/>} disabled={!changed} loading={saving} onClick={() => void save()}/>
            </Tooltip>
            <Popconfirm title="删除这个密码？" okText="删除" okButtonProps={{danger: true}} cancelText="取消" onConfirm={() => void remove()}>
                <Button size="small" danger icon={<CloseOutlined/>} loading={deleting}/>
            </Popconfirm>
        </Space>
    </Flex>;
}

function AccountCard({account, onDeleted}: { account: AccountData; onDeleted: () => void }) {
    const [tokens, setTokens] = useState(account.tokens);
    const [adding, setAdding] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const isMobile = useIsMobile();

    const remove = async () => {
        setDeleting(true);
        try {
            await deregisterAccount(account.name);
            message.success("已删除");
            onDeleted();
        } catch (e) {
            message.error("删除失败" + errText(e));
            setDeleting(false);
        }
    };

    return <Card
        size="small"
        title={account.name}
        style={{width: isMobile ? "100%" : 440}}
        extra={<Space size={0}>
            <Tooltip title="添加密码">
                <Button type="text" icon={<PlusOutlined/>} onClick={() => setAdding(true)}/>
            </Tooltip>
            <Popconfirm title={`删除账号 ${account.name}？`} okText="删除" okButtonProps={{danger: true}} cancelText="取消"
                        onConfirm={() => void remove()}>
                <Button type="text" danger icon={<DeleteOutlined/>} loading={deleting}/>
            </Popconfirm>
        </Space>}
    >
        {tokens.length === 0
            ? <Typography.Text type="secondary">还没有密码</Typography.Text>
            : <Flex vertical gap={10}>
                {tokens.map((t) => <TokenRow
                    key={t.tokenID}
                    account={account.name}
                    token={t}
                    onDeleted={() => setTokens((list) => list.filter((x) => x.tokenID !== t.tokenID))}
                />)}
            </Flex>}
        {adding && <AddTokenModal
            account={account.name}
            onAdd={(token) => {
                setTokens((list) => [...list, token]);
                setAdding(false);
            }}
            onCancel={() => setAdding(false)}
        />}
    </Card>;
}

function AddAccountModal({onAdd, onCancel}: { onAdd: (name: string) => void; onCancel: () => void }) {
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        setLoading(true);
        try {
            await registerAccount(name);
            message.success("已添加");
            onAdd(name);
        } catch (e) {
            message.error("添加失败" + errText(e));
        } finally {
            setLoading(false);
        }
    };

    return <Modal
        open
        title="新增账号"
        onCancel={onCancel}
        okButtonProps={{loading, disabled: name.trim() === ""}}
        onOk={() => void submit()}
        okText="添加"
        cancelText="取消"
    >
        <Input placeholder="用户名" value={name} onChange={(e) => setName(e.target.value.trim())}/>
    </Modal>;
}

export function AccountAdmin() {
    const [accounts, setAccounts] = useState<AccountData[] | null>(null);
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        let cancelled = false;
        getAllAccounts()
            .then((all) => {
                if (cancelled) return;
                setAccounts(Object.entries(all).map(([name, tokens]) => toAccount(name, tokens ?? {})));
            })
            .catch((e) => {
                if (cancelled) return;
                message.error("获取账号失败" + errText(e));
                setAccounts([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (accounts === null) {
        return <Flex justify="center" style={{padding: 48}}><Spin/></Flex>;
    }

    return <Flex vertical gap={12}>
        <div>
            <Button icon={<PlusOutlined/>} onClick={() => setAdding(true)}>新增账号</Button>
        </div>
        {accounts.length === 0 && <Empty description="没有账号"/>}
        <Flex wrap="wrap" gap={12} align="flex-start">
            {accounts.map((a) => <AccountCard
                key={a.name}
                account={a}
                onDeleted={() => setAccounts((list) => list && list.filter((x) => x.name !== a.name))}
            />)}
        </Flex>
        {adding && <AddAccountModal
            onAdd={(name) => {
                setAdding(false);
                setAccounts((list) => [...(list ?? []), {name, tokens: []}]);
            }}
            onCancel={() => setAdding(false)}
        />}
    </Flex>;
}
