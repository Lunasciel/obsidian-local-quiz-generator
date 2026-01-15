import { App } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { Question } from "../../utils/types";
import QuizModal from "./QuizModal";
import QuizSaver from "../../services/quizSaver";
import { ConsensusAuditTrail } from "../../consensus/types";

interface QuizModalWrapperProps {
	app: App;
	settings: QuizSettings;
	quiz: Question[];
	quizSaver: QuizSaver;
	reviewing: boolean;
	handleClose: () => void;
	auditTrail?: ConsensusAuditTrail;
}

const QuizModalWrapper = ({ app, settings, quiz, quizSaver, reviewing, handleClose, auditTrail }: QuizModalWrapperProps) => {
	return <QuizModal
		app={app}
		settings={settings}
		quiz={quiz}
		quizSaver={quizSaver}
		reviewing={reviewing}
		handleClose={handleClose}
		auditTrail={auditTrail}
	/>;
};

export default QuizModalWrapper;
