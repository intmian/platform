import dayjs from "dayjs";

export function signedClass(value?: number) {
    if ((value || 0) > 0) {
        return "is-positive";
    }
    if ((value || 0) < 0) {
        return "is-negative";
    }
    return "";
}

export function daysBetween(prevDate?: string, currentDate?: string) {
    if (!prevDate || !currentDate) {
        return null;
    }
    const prev = dayjs(prevDate);
    const current = dayjs(currentDate);
    if (!prev.isValid() || !current.isValid()) {
        return null;
    }
    const days = current.diff(prev, "day");
    return days > 0 ? days : null;
}

export function downloadJson(fileName: string, data: object) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

export function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

export function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

export function orderedStrings(values: string[]) {
    const seen = new Set<string>();
    const next: string[] = [];
    values.forEach((value) => {
        const item = value.trim();
        if (!item || seen.has(item)) {
            return;
        }
        seen.add(item);
        next.push(item);
    });
    return next;
}

export function compactStrings(values: string[]) {
    return values.map((value) => value.trim()).filter(Boolean);
}
