import { Fragment } from 'react';

/**
 * Tiny, safe Markdown for assistant replies: paragraphs, **bold**, *italic*, `code`,
 * lists, headings (as bold lines), code blocks and links. No HTML is ever injected.
 * hideAmounts: "Ukryj kwoty" also covers the chat ("3 000 zł" -> "••• zł").
 */
const MONEY = /[+−-]?\d[\d\s\u00a0.,]*\s?zł/g;
const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)<>]+|\*(?!\s)[^*\n]+?\*)/g;

function inline(text, hide, keyPrefix) {
    const source = hide ? text.replace(MONEY, '••• zł') : text;
    const parts = source.split(INLINE);
    return parts.map((part, i) => {
        const key = `${keyPrefix}-${i}`;
        if (!part) return null;
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return <strong key={key} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
            return <code key={key} className="px-1 py-0.5 rounded bg-ink/5 text-[0.9em]">{part.slice(1, -1)}</code>;
        }
        const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
        if (link) {
            return (
                <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-primary-600">
                    {link[1]}
                </a>
            );
        }
        if (/^https?:\/\//.test(part)) {
            return (
                <a key={key} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-primary-600 break-all">
                    {part.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
            );
        }
        if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
            return <em key={key}>{part.slice(1, -1)}</em>;
        }
        return <Fragment key={key}>{part}</Fragment>;
    });
}

function parseBlocks(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let para = [];
    let list = null;
    let code = null;

    const flushPara = () => {
        if (para.length) blocks.push({ type: 'p', lines: para });
        para = [];
    };
    const flushList = () => {
        if (list) blocks.push(list);
        list = null;
    };

    for (const line of lines) {
        if (code) {
            if (line.trim().startsWith('```')) {
                blocks.push(code);
                code = null;
            } else {
                code.lines.push(line);
            }
            continue;
        }
        if (line.trim().startsWith('```')) {
            flushPara();
            flushList();
            code = { type: 'code', lines: [] };
            continue;
        }
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (bullet || numbered) {
            flushPara();
            const kind = bullet ? 'ul' : 'ol';
            if (!list || list.type !== kind) {
                flushList();
                list = { type: kind, items: [], start: numbered ? Number(numbered[1]) : 1 };
            }
            list.items.push(bullet ? bullet[1] : numbered[2]);
            continue;
        }
        if (!line.trim()) {
            flushPara();
            flushList();
            continue;
        }
        // a line under a list item continues it
        if (list && /^\s{2,}\S/.test(line)) {
            list.items[list.items.length - 1] += ` ${line.trim()}`;
            continue;
        }
        flushList();
        const heading = line.match(/^#{1,6}\s+(.*)$/);
        if (heading) {
            flushPara();
            blocks.push({ type: 'h', text: heading[1] });
            continue;
        }
        if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
            flushPara();
            continue;
        }
        para.push(line);
    }
    if (code) blocks.push(code);
    flushPara();
    flushList();
    return blocks;
}

export default function Markdown({ text, hideAmounts = false }) {
    const blocks = parseBlocks(text || '');
    return (
        <div className="space-y-2.5 leading-relaxed break-words">
            {blocks.map((block, i) => {
                if (block.type === 'h') {
                    return <p key={i} className="font-semibold text-ink">{inline(block.text.replace(/\*\*/g, ''), hideAmounts, i)}</p>;
                }
                if (block.type === 'code') {
                    return (
                        <pre key={i} className="whitespace-pre-wrap rounded-xl bg-ink/5 px-3 py-2 text-sm font-mono">
                            {block.lines.join('\n')}
                        </pre>
                    );
                }
                if (block.type === 'ul' || block.type === 'ol') {
                    const List = block.type;
                    return (
                        <List
                            key={i}
                            start={block.type === 'ol' ? block.start : undefined}
                            className={`${block.type === 'ul' ? 'list-disc' : 'list-decimal'} pl-5 space-y-1 marker:text-ink-muted`}
                        >
                            {block.items.map((item, j) => (
                                <li key={j}>{inline(item, hideAmounts, `${i}-${j}`)}</li>
                            ))}
                        </List>
                    );
                }
                return (
                    <p key={i}>
                        {block.lines.map((line, j) => (
                            <Fragment key={j}>
                                {j > 0 && <br />}
                                {inline(line, hideAmounts, `${i}-${j}`)}
                            </Fragment>
                        ))}
                    </p>
                );
            })}
        </div>
    );
}
