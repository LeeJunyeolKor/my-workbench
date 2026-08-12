import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface SelectionPopoverProps {
	x: number;
	y: number;
	selectedText: string;
	onAddComment: (selectedText: string, comment: string) => void;
	onClose: () => void;
}

export function SelectionPopover({
	x,
	y,
	selectedText,
	onAddComment,
	onClose,
}: SelectionPopoverProps) {
	const [comment, setComment] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		// Focus the input field on mount
		inputRef.current?.focus();
	}, []);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!comment.trim()) return;
		onAddComment(selectedText, comment.trim());
		setComment("");
		onClose();
	};

	// Prevent selection loss when clicking inside the popover
	const handlePointerDown = (e: React.PointerEvent) => {
		e.preventDefault();
	};

	// Preview truncated selected text
	const truncatedText =
		selectedText.length > 50
			? `${selectedText.substring(0, 50)}...`
			: selectedText;

	return (
		<div
			onPointerDown={handlePointerDown}
			className="absolute z-50 flex flex-col gap-2 w-72 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-2xl animate-in zoom-in-95 duration-100 ease-out"
			role="dialog"
			aria-label="수정 코멘트"
			style={{
				left: `${x}px`,
				top: `${y}px`,
				transform: "translate(-50%, -100%) translateY(-8px)", // Position above selection
			}}
		>
			{/* Header */}
			<div className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-1.5 shrink-0">
				<span className="text-[10px] font-bold uppercase tracking-wider text-indigo-650 dark:text-indigo-400 select-none">
					수정 코멘트 달기
				</span>
				<button
					type="button"
					onClick={onClose}
					className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-white transition"
					aria-label="수정 코멘트 닫기"
				>
					<X className="h-3.5 w-3.5" aria-hidden="true" />
				</button>
			</div>

			{/* Selected text preview */}
			<div className="p-2 rounded bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-850 select-none">
				<span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 block mb-0.5">
					선택 영역
				</span>
				<p className="text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300 font-mono italic break-words line-clamp-2">
					"{truncatedText}"
				</p>
			</div>

			{/* Input form */}
			<form onSubmit={handleSubmit} className="flex gap-1.5 items-center">
				<input
					ref={inputRef}
					type="text"
					value={comment}
					onChange={(e) => setComment(e.target.value)}
					placeholder="수정 요청 사항을 적어주세요..."
					aria-label="수정 요청 코멘트"
					className="flex-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
				/>
				<button
					type="submit"
					disabled={!comment.trim()}
					className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 transition shrink-0 shadow-md shadow-indigo-600/10 cursor-pointer"
					title="대기열에 추가"
					aria-label="대기열에 추가"
				>
					<Plus className="h-3.5 w-3.5" aria-hidden="true" />
				</button>
			</form>
		</div>
	);
}
