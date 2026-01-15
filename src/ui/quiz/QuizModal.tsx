import { App } from "obsidian";
import { useState } from "react";
import { QuizSettings } from "../../settings/config";
import { Question } from "../../utils/types";
import {
	isFillInTheBlank,
	isMatching,
	isMultipleChoice,
	isSelectAllThatApply,
	isShortOrLongAnswer,
	isTrueFalse
} from "../../utils/typeGuards";
import ModalButton from "../components/ModalButton";
import TrueFalseQuestion from "./TrueFalseQuestion";
import MultipleChoiceQuestion from "./MultipleChoiceQuestion";
import SelectAllThatApplyQuestion from "./SelectAllThatApplyQuestion";
import FillInTheBlankQuestion from "./FillInTheBlankQuestion";
import MatchingQuestion from "./MatchingQuestion";
import ShortOrLongAnswerQuestion from "./ShortOrLongAnswerQuestion";
import QuizSaver from "../../services/quizSaver";
import { ConsensusAuditTrail } from "../../consensus/types";
import { AuditTrailModal } from "../consensus/auditTrailModal";

interface QuizModalProps {
	app: App;
	settings: QuizSettings;
	quiz: Question[];
	quizSaver: QuizSaver;
	reviewing: boolean;
	handleClose: () => void;
	auditTrail?: ConsensusAuditTrail;
}

const QuizModal = ({ app, settings, quiz, quizSaver, reviewing, handleClose, auditTrail }: QuizModalProps) => {
	const [questionIndex, setQuestionIndex] = useState<number>(0);
	const [savedQuestions, setSavedQuestions] = useState<boolean[]>(Array(quiz.length).fill(reviewing));

	const handlePreviousQuestion = () => {
		if (questionIndex > 0) {
			setQuestionIndex(questionIndex - 1);
		}
	};

	const handleSaveQuestion = async () => {
		const updatedSavedQuestions = [...savedQuestions];
		updatedSavedQuestions[questionIndex] = true;
		setSavedQuestions(updatedSavedQuestions);
		await quizSaver.saveQuestion(quiz[questionIndex]);
	};

	const handleSaveAllQuestions = async () => {
		const unsavedQuestions = quiz.filter((_, index) => !savedQuestions[index]);
		const updatedSavedQuestions = savedQuestions.map(() => true);
		setSavedQuestions(updatedSavedQuestions);
		await quizSaver.saveAllQuestions(unsavedQuestions);
	};

	const handleNextQuestion = () => {
		if (questionIndex < quiz.length - 1) {
			setQuestionIndex(questionIndex + 1);
		}
	};

	const handleViewAuditTrail = () => {
		if (auditTrail) {
			const auditModal = new AuditTrailModal(app, auditTrail, questionIndex);
			auditModal.open();
		}
	};

	const getConsensusTrailForQuestion = () => {
		if (!auditTrail) return undefined;
		return auditTrail.questionTrails.find(
			trail => trail.question === quiz[questionIndex]
		);
	};

	const renderQuestion = () => {
		const question = quiz[questionIndex];
		const consensusTrail = getConsensusTrailForQuestion();

		if (isTrueFalse(question)) {
			return <TrueFalseQuestion key={questionIndex} app={app} question={question} consensusTrail={consensusTrail} />;
		} else if (isMultipleChoice(question)) {
			return <MultipleChoiceQuestion key={questionIndex} app={app} question={question} consensusTrail={consensusTrail} />;
		} else if (isSelectAllThatApply(question)) {
			return <SelectAllThatApplyQuestion key={questionIndex} app={app} question={question} consensusTrail={consensusTrail} />;
		} else if (isFillInTheBlank(question)) {
			return <FillInTheBlankQuestion key={questionIndex} app={app} question={question} consensusTrail={consensusTrail} />;
		} else if (isMatching(question)) {
			return <MatchingQuestion key={questionIndex} app={app} question={question} consensusTrail={consensusTrail} />;
		} else if (isShortOrLongAnswer(question)) {
			return <ShortOrLongAnswerQuestion key={questionIndex} app={app} question={question} settings={settings} consensusTrail={consensusTrail} />;
		}
	};

	return (
		<div className="modal-container mod-dim">
			<div className="modal-bg" style={{opacity: 0.85}} onClick={handleClose} />
			<div className="modal modal-qg">
				<div className="modal-close-button" onClick={handleClose} />
				<div className="modal-header">
					<div className="modal-title modal-title-qg">
						Question {questionIndex + 1} of {quiz.length}
						{auditTrail && (
							<span className="consensus-badge" title="Generated with consensus">
								✓ Consensus
							</span>
						)}
					</div>
				</div>
				<div className="modal-content modal-content-flex-qg">
					<div className="modal-button-container-qg">
						<ModalButton
							icon="arrow-left"
							tooltip="Back"
							onClick={handlePreviousQuestion}
							disabled={questionIndex === 0}
						/>
						<ModalButton
							icon="save"
							tooltip="Save"
							onClick={handleSaveQuestion}
							disabled={savedQuestions[questionIndex]}
						/>
						<ModalButton
							icon="save-all"
							tooltip="Save all"
							onClick={handleSaveAllQuestions}
							disabled={!savedQuestions.includes(false)}
						/>
						{auditTrail && (
							<ModalButton
								icon="info"
								tooltip="View Consensus Details"
								onClick={handleViewAuditTrail}
								disabled={false}
							/>
						)}
						<ModalButton
							icon="arrow-right"
							tooltip="Next"
							onClick={handleNextQuestion}
							disabled={questionIndex === quiz.length - 1}
						/>
					</div>
					<hr className="quiz-divider-qg" />
					{renderQuestion()}
				</div>
			</div>
		</div>
	);
};

export default QuizModal;
