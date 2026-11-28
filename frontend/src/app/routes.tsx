import { Navigate, type RouteObject } from 'react-router';
import { AdminClassPage } from '../features/admin/AdminClassPage';
import { AdminClassesPage } from '../features/admin/AdminClassesPage';
import { LoginPage } from '../features/auth/LoginPage';
import { CreateLabRoute } from '../features/lab-authoring/CreateLabRoute';
import { StudentLabPage, StudentLabsPage } from '../features/lab-view/StudentLabPage';
import { ReviewQueuePage } from '../features/review-queue/ReviewQueuePage';
import { SubmitJudgePage } from '../features/submit-judge/SubmitJudgePage';
import { TaClassesPage } from '../features/ta-classes/TaClassesPage';
import { TaClassPage } from '../features/ta-classes/TaClassPage';
import { AdminLayout, StudentLayout, TaLayout } from './AppLayout';
import { NotFoundRoute } from './NotFoundPage';
import { PublicLayout } from './PublicLayout';
import { HomeRedirect, RequireRole } from './RequireRole';

export const routes: RouteObject[] = [
  { path: '/', element: <HomeRedirect /> },
  {
    path: '/login',
    element: (
      <PublicLayout>
        <LoginPage />
      </PublicLayout>
    ),
  },
  {
    path: '/admin',
    element: (
      <RequireRole role="admin">
        <AdminLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      // Admin pages set their own tab title (usePageTitle).
      { path: 'classes', element: <AdminClassesPage /> },
      { path: 'classes/:classId', element: <AdminClassPage /> },
    ],
  },
  {
    path: '/ta',
    element: (
      <RequireRole role="ta">
        <TaLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'classes', element: <TaClassesPage /> },
      { path: 'classes/:classId', element: <TaClassPage /> },
      { path: 'review-queue', element: <ReviewQueuePage /> },
      // Old TA home (one page of every lab); kept so bookmarks and links still work.
      { path: 'labs', element: <Navigate to="/ta/classes" replace /> },
      { path: 'classes/:classId/labs/new', element: <CreateLabRoute /> },
      { path: 'labs/:labId/review', element: <ReviewQueuePage /> },
    ],
  },
  {
    path: '/student',
    element: (
      <RequireRole role="student">
        <StudentLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'labs', element: <StudentLabsPage /> },
      { path: 'labs/:labId', element: <StudentLabPage /> },
      { path: 'submit', element: <SubmitJudgePage /> },
    ],
  },
  { path: '*', element: <NotFoundRoute /> },
];
