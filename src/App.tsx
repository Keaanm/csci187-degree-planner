import { BrowserRouter, NavLink, Route, Routes, useParams } from 'react-router';

// Placeholder pages. Replace each with a real component in src/pages/ as it gets built.
function ProgressPage() {
  return <h1>Degree Progress</h1>;
}

function PlanPage() {
  return <h1>4-Year Plan</h1>;
}

function CoursesPage() {
  return <h1>Course Lookup</h1>;
}

function CoursePage() {
  const { code } = useParams();
  return <h1>Course {code}</h1>;
}

function SetupPage() {
  return <h1>Setup</h1>;
}

export default function App() {
  return (
    <BrowserRouter>
      <nav>
        <NavLink to="/">Progress</NavLink>
        <NavLink to="/plan">4-Year Plan</NavLink>
        <NavLink to="/courses">Courses</NavLink>
        <NavLink to="/setup">Setup</NavLink>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<ProgressPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:code" element={<CoursePage />} />
          <Route path="/setup" element={<SetupPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
