import { App, Component } from "obsidian";
import { useEffect, useRef, useState } from "react";
import { MultipleChoice } from "../../utils/types";
import { renderQuizContent } from "../../utils/rendering";
import { QuestionConsensusTrail } from "../../consensus/types";
import ConsensusIndicator from "../components/ConsensusIndicator";

interface MultipleChoiceQuestionProps {
	app: App;
	question: MultipleChoice;
	consensusTrail?: QuestionConsensusTrail;
}

const MultipleChoiceQuestion = ({ app, question, consensusTrail }: MultipleChoiceQuestionProps) => {
	const [userAnswer, setUserAnswer] = useState<number | null>(null);
	const questionRef = useRef<HTMLDivElement>(null);
	const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

	useEffect(() => {
		const component = new Component();

		// Render question with table support
		if (questionRef.current) {
			renderQuizContent(app, question.question, questionRef.current, "", component);
		}

		// Render options with table support
		buttonRefs.current = buttonRefs.current.slice(0, question.options.length);
		buttonRefs.current.forEach((button, index) => {
			if (button) {
				renderQuizContent(app, question.options[index], button, "", component);
			}
		});
	}, [app, question]);

	const getButtonClass = (buttonAnswer: number) => {
		if (userAnswer === null) return "multiple-choice-button-qg";
		const correct = buttonAnswer === question.answer;
		const selected = buttonAnswer === userAnswer;
		if (correct && selected) return "multiple-choice-button-qg correct-choice-qg";
		if (correct) return "multiple-choice-button-qg correct-choice-qg not-selected-qg";
		if (selected) return "multiple-choice-button-qg incorrect-choice-qg";
		return "multiple-choice-button-qg";
	};

	return (
		<div className="question-container-qg">
			<div className="question-qg" ref={questionRef} />
			<ConsensusIndicator consensusTrail={consensusTrail} />
			<div className="multiple-choice-container-qg">
				{question.options.map((_, index) => (
					<button
						key={index}
						ref={(el) => buttonRefs.current[index] = el}
						className={getButtonClass(index)}
						onClick={() => setUserAnswer(index)}
						disabled={userAnswer !== null}
					/>
				))}
			</div>
		</div>
	);
};

export default MultipleChoiceQuestion;
