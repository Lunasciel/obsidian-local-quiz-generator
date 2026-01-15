import { App, Component, Notice } from "obsidian";
import { useEffect, useRef, useState } from "react";
import { FillInTheBlank } from "../../utils/types";
import { renderQuizContent } from "../../utils/rendering";
import AnswerInput from "../components/AnswerInput";
import { QuestionConsensusTrail } from "../../consensus/types";
import ConsensusIndicator from "../components/ConsensusIndicator";

interface FillInTheBlankQuestionProps {
	app: App;
	question: FillInTheBlank;
	consensusTrail?: QuestionConsensusTrail;
}

const FillInTheBlankQuestion = ({ app, question, consensusTrail }: FillInTheBlankQuestionProps) => {
	const [filledBlanks, setFilledBlanks] = useState<string[]>(Array(question.answer.length).fill(""));
	const questionRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const generateQuestion = () => {
			let blankIndex = 0;
			return question.question.replace(/`_+`/g, match => {
				if (blankIndex < filledBlanks.length && filledBlanks[blankIndex] === question.answer[blankIndex]) {
					return filledBlanks[blankIndex++];
				}
				blankIndex++;
				return match;
			});
		};

		const component = new Component();

		// Render question with table support
		if (questionRef.current) {
			renderQuizContent(app, generateQuestion(), questionRef.current, "", component);
		}
	}, [app, question, filledBlanks]);

	const handleSubmit = (input: string) => {
		const normalizedInput = input.toLowerCase().trim();
		const blankIndex = question.answer.findIndex(
			(blank, index) => blank.toLowerCase() === normalizedInput && !filledBlanks[index]
		);

		if (blankIndex !== -1) {
			setFilledBlanks(prevFilledBlanks => {
				const newFilledBlanks = [...prevFilledBlanks];
				newFilledBlanks[blankIndex] = question.answer[blankIndex];
				return newFilledBlanks;
			});
		} else if (normalizedInput === "skip") {
			setFilledBlanks(question.answer);
		} else {
			new Notice("Incorrect");
		}
	};

	return (
		<div className="question-container-qg">
			<div className="question-qg" ref={questionRef} />
			<ConsensusIndicator consensusTrail={consensusTrail} />
			<div className="input-container-qg">
				<AnswerInput onSubmit={handleSubmit} disabled={filledBlanks.every(blank => blank.length > 0)} />
				<div className="instruction-footnote-qg">
					Press enter to submit your answer to a blank. Enter "skip" to reveal all answers.
				</div>
			</div>
		</div>
	);
};

export default FillInTheBlankQuestion;
