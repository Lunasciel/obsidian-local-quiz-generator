import { App, Component } from "obsidian";
import { useEffect, useRef } from "react";
import { renderWithTables, renderQuizContent, renderFlashcardContent } from "../../utils/rendering";

/**
 * Context type for determining which CSS class to apply to tables
 */
export type RenderContext = "quiz" | "flashcard" | "generic";

interface TableRendererProps {
	/**
	 * The Obsidian App instance for markdown rendering
	 */
	app: App;

	/**
	 * The markdown content to render (may contain tables, images, code blocks, etc.)
	 */
	content: string;

	/**
	 * The source file path for resolving relative links
	 * @default ""
	 */
	sourcePath?: string;

	/**
	 * The rendering context (determines CSS styling)
	 * - "quiz": Applies quiz-specific table styling
	 * - "flashcard": Applies flashcard-specific table styling
	 * - "generic": Applies base table styling only
	 * @default "generic"
	 */
	context?: RenderContext;

	/**
	 * Additional CSS class names to apply to the container
	 */
	className?: string;
}

/**
 * TableRenderer Component
 *
 * A reusable React component that renders markdown content with proper table support.
 * This component wraps the rendering utilities from src/utils/rendering.ts to provide
 * a convenient React interface for rendering content with tables in quiz questions,
 * flashcard content, or any other context.
 *
 * Features:
 * - Automatic table detection and rendering via Obsidian's MarkdownRenderer
 * - Horizontal scrolling for wide tables
 * - Context-specific CSS styling (quiz vs flashcard vs generic)
 * - Support for all markdown features (tables, images, code blocks, formulas, etc.)
 * - Proper lifecycle management with Obsidian's Component system
 *
 * Usage:
 * ```tsx
 * <TableRenderer
 *   app={app}
 *   content="| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |"
 *   context="quiz"
 *   sourcePath="path/to/source.md"
 * />
 * ```
 *
 * @param props - The component props
 * @returns A rendered markdown container
 */
const TableRenderer = ({
	app,
	content,
	sourcePath = "",
	context = "generic",
	className = ""
}: TableRendererProps) => {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// Create a new Obsidian Component for lifecycle management
		// This ensures proper cleanup when the component unmounts
		const component = new Component();

		if (containerRef.current) {
			// Choose the appropriate rendering function based on context
			const renderContent = async () => {
				if (!containerRef.current) return;

				switch (context) {
					case "quiz":
						await renderQuizContent(
							app,
							content,
							containerRef.current,
							sourcePath,
							component
						);
						break;
					case "flashcard":
						await renderFlashcardContent(
							app,
							content,
							containerRef.current,
							sourcePath,
							component
						);
						break;
					case "generic":
					default:
						await renderWithTables(
							app,
							content,
							containerRef.current,
							sourcePath,
							component
						);
						break;
				}
			};

			renderContent();
		}

		// Cleanup: unload the component when this React component unmounts
		return () => {
			component.unload();
		};
	}, [app, content, sourcePath, context]);

	return (
		<div
			ref={containerRef}
			className={`table-renderer-container-qg ${className}`.trim()}
		/>
	);
};

export default TableRenderer;
