import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

function normalizeMath(content = "") {
    return content
        .replace(/\\\[/g, "$$")
        .replace(/\\\]/g, "$$")
        .replace(/\\\(/g, "$")
        .replace(/\\\)/g, "$");
}

export default function MessageContent({ content }) {
    const normalizedContent = normalizeMath(content || "");

    return (
        <div className="message-content">
            <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    p: ({ children }) => (
                        <p className="mb-3 last:mb-0">
                            {children}
                        </p>
                    ),

                    strong: ({ children }) => (
                        <strong className="font-bold text-white">
                            {children}
                        </strong>
                    ),

                    em: ({ children }) => (
                        <em className="italic text-slate-200">
                            {children}
                        </em>
                    ),

                    ul: ({ children }) => (
                        <ul className="mb-3 ml-5 list-disc space-y-1">
                            {children}
                        </ul>
                    ),

                    ol: ({ children }) => (
                        <ol className="mb-3 ml-5 list-decimal space-y-1">
                            {children}
                        </ol>
                    ),

                    li: ({ children }) => (
                        <li className="pl-1">
                            {children}
                        </li>
                    ),

                    h1: ({ children }) => (
                        <h1 className="mb-3 text-lg font-bold text-white">
                            {children}
                        </h1>
                    ),

                    h2: ({ children }) => (
                        <h2 className="mb-3 text-base font-semibold text-white">
                            {children}
                        </h2>
                    ),

                    h3: ({ children }) => (
                        <h3 className="mb-2 text-sm font-semibold text-white">
                            {children}
                        </h3>
                    ),

                    code: ({ children, className }) => {
                        const isBlock = className;

                        if (!isBlock) {
                            return (
                                <code className="rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 text-[0.85em] text-cyan-100">
                                    {children}
                                </code>
                            );
                        }

                        return (
                            <code className="block overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs leading-relaxed text-slate-100">
                                {children}
                            </code>
                        );
                    },

                    pre: ({ children }) => (
                        <pre className="mb-3 overflow-x-auto rounded-xl">
                            {children}
                        </pre>
                    ),

                    blockquote: ({ children }) => (
                        <blockquote className="mb-3 border-l-2 border-cyan-400/50 pl-3 text-slate-300">
                            {children}
                        </blockquote>
                    ),
                }}
            >
                {normalizedContent}
            </ReactMarkdown>
        </div>
    );
}