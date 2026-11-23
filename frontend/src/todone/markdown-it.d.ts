// markdown-it 14 不带类型，项目里也没装 @types/markdown-it。这里只声明 Todone 用到的部分；
// 以后装了 @types/markdown-it 就删掉这个文件。
declare module "markdown-it" {
    export default class MarkdownIt {
        constructor(options?: Record<string, unknown>);

        render(src: string): string;
    }
}
