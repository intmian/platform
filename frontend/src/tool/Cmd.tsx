import {useParams} from "react-router-dom";

export function Cmd() {
    const {mode, open} = useParams();
    if (mode === 'TOOL') {
        return (
            <div>
                <h1>Tool</h1>
                <p>mode: {mode}</p>
                <p>open: {open}</p>
            </div>
        );
    }
}