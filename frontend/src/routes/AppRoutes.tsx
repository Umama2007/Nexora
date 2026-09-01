import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout/AppLayout';
import Landing from '../pages/Landing/Landing';
import Dashboard from '../pages/Dashboard/Dashboard';
import ResumeUpload from '../pages/ResumeUpload/ResumeUpload';
import AnalysisResults from '../pages/AnalysisResults/AnalysisResults';
import ResumeFeedback from '../pages/ResumeFeedback/ResumeFeedback';
import InterviewModeSelect from '../pages/InterviewRoom/InterviewModeSelect';
import InterviewRoom from '../pages/InterviewRoom/InterviewRoom';
import InterviewFeedback from '../pages/InterviewRoom/InterviewFeedback';
import JobMatch from '../pages/JobMatch/JobMatch';
import Roadmap from '../pages/Roadmap/Roadmap';
import Recommendations from '../pages/Recommendations/Recommendations';
import AnalysisHistory from '../pages/AnalysisHistory/AnalysisHistory';
import Profile from '../pages/Profile/Profile';
import NotFound from '../pages/NotFound/NotFound';

export const AppRoutes: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing Page */}
        <Route path="/" element={<Landing />} />

        {/* Dashboard Layout Wrapper for App Sub-Routes */}
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/resume-analysis" element={<ResumeUpload />} />
          <Route path="/analysis/:id" element={<AnalysisResults />} />
          <Route path="/analysis/:id/feedback" element={<ResumeFeedback />} />
          <Route path="/interview" element={<InterviewModeSelect />} />
          <Route path="/interview/:sessionId" element={<InterviewRoom />} />
          <Route path="/interview/:sessionId/feedback" element={<InterviewFeedback />} />
          <Route path="/job-match" element={<JobMatch />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/analysis-history" element={<AnalysisHistory />} />
          <Route path="/profile" element={<Profile />} />
          
          {/* Catch-all 404 nested inside the layout */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};
export default AppRoutes;
