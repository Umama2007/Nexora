import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, CornerDownLeft, Award, HelpCircle, Loader2, ArrowLeft } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { interviewService } from '../../services/interviewService';
import { InterviewSession } from '../../types';
import styles from './InterviewRoom.module.css';

export const InterviewRoom: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [inputText, setInputText] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const load = async () => {
      const sess = await interviewService.getSession(sessionId);
      if (!cancelled) {
        setSession(sess ?? null);
        setIsLoadingSession(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Scroll to bottom whenever history updates or typing starts
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.chatHistory, isAiTyping]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !inputText.trim() || isAiTyping || session?.status === 'completed') return;

    const text = inputText.trim();
    setInputText('');
    setIsAiTyping(true);
    setSubmitError('');

    // Optimistically push user message to UI immediately
    if (session) {
      const updatedHistory = [
        ...session.chatHistory,
        {
          id: `temp-user-${Date.now()}`,
          sender: 'user' as const,
          text,
          timestamp: new Date().toISOString()
        }
      ];
      setSession({
        ...session,
        chatHistory: updatedHistory
      });
    }

    try {
      const updatedSession = await interviewService.submitMessage(sessionId, text);
      setIsAiTyping(false);
      setSession(updatedSession);

      // Session ended (all questions answered): the feedback page runs scoring
      if (updatedSession.status === 'completed') {
        navigate(`/interview/${sessionId}/feedback`);
      }
    } catch (err) {
      setIsAiTyping(false);
      const message = err instanceof Error ? err.message : 'Failed to send your message.';
      if (message.includes('temporarily at capacity') || message.includes('AI_PROVIDERS_EXHAUSTED')) {
        setSubmitError('Our AI service is temporarily at capacity — please try again in a few minutes.');
      } else {
        setSubmitError(message);
      }
      // Resync with the server: the optimistic message was never persisted
      const fresh = await interviewService.getSession(sessionId);
      if (fresh) setSession(fresh);
    }
  };

  const handleEndInterview = () => {
    if (!sessionId) return;
    // Early end: the scoring pass on the feedback page marks the session completed
    navigate(`/interview/${sessionId}/feedback`);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  if (isLoadingSession) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 className={styles.spinIcon} size={36} />
        <p>Opening interview room...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={styles.errorContainer}>
        <h3>Session Not Found</h3>
        <p>We could not find the active interview session you requested.</p>
        <Button variant="primary" onClick={() => navigate('/interview')}>
          Back to Interviews
        </Button>
      </div>
    );
  }

  const { type, status, currentQuestionIndex, questionsCount, chatHistory } = session;
  const isCompleted = status === 'completed';
  const hasAnswered = chatHistory.some((m) => m.sender === 'user');

  return (
    <div className={styles.container}>
      {/* Top Header Row */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Button variant="ghost" onClick={() => navigate('/interview')} className={styles.backBtn}>
            <ArrowLeft size={16} />
            Exit
          </Button>
          <div className={styles.titleMeta}>
            <h2>{type} Interview</h2>
            <Badge variant={isCompleted ? 'success' : 'primary'}>
              {isCompleted ? 'Completed' : 'Practice Session'}
            </Badge>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.progress}>
            <HelpCircle size={16} className={styles.progressIcon} />
            <span>
              Question <strong>{Math.min(questionsCount, currentQuestionIndex)}</strong> of {questionsCount}
            </span>
          </div>
          {!isCompleted && (
            <Button
              variant="secondary"
              onClick={handleEndInterview}
              className={styles.endBtn}
              disabled={!hasAnswered || isAiTyping}
              title={hasAnswered ? 'End the interview and get your scores' : 'Answer at least one question first'}
            >
              <Award size={14} />
              End & Get Feedback
            </Button>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <Card className={styles.chatCard} noPadding>
        <div className={styles.chatArea}>
          {chatHistory.map((msg) => {
            const isAI = msg.sender === 'ai';
            return (
              <div
                key={msg.id}
                className={`${styles.bubbleWrapper} ${isAI ? styles.aiWrapper : styles.userWrapper}`}
              >
                <div className={`${styles.bubble} ${isAI ? styles.aiBubble : styles.userBubble}`}>
                  {isAI && (
                    <div className={styles.avatarName}>
                      Interviewer
                    </div>
                  )}
                  <p className={styles.messageText}>{msg.text}</p>
                  <span className={styles.timeText}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isAiTyping && (
            <div className={`${styles.bubbleWrapper} ${styles.aiWrapper}`}>
              <div className={`${styles.bubble} ${styles.aiBubble}`}>
                <div className={styles.avatarName}>Interviewer</div>
                <div className={styles.typingIndicator}>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        {submitError && (
          <div className={styles.errorBanner} role="alert">
            {submitError}
          </div>
        )}
        <form onSubmit={handleSend} className={styles.inputForm}>
          <textarea
            className={styles.input}
            placeholder={isCompleted ? 'This interview session is complete.' : 'Type your response here... (Press Enter to send)'}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            rows={2}
            disabled={isAiTyping || isCompleted}
          />
          <div className={styles.inputControls}>
            <span className={styles.helpText}>
              <CornerDownLeft size={12} /> Enter to send
            </span>
            <Button
              type="submit"
              variant="primary"
              className={styles.sendBtn}
              disabled={!inputText.trim() || isAiTyping || isCompleted}
            >
              <Send size={16} />
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
export default InterviewRoom;
