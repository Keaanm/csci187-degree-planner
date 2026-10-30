import CourseLink from '@/components/CourseLink';

// "Still need ..." text for an unmet requirement, linking each missing course.
export default function StillNeeded({ stillNeeded, missing }: { stillNeeded: number; missing: string[] }) {
  return (
    <>
      Still need {stillNeeded === missing.length ? '' : `${stillNeeded} of `}
      {missing.map((code, i) => (
        <span key={code}>
          {i > 0 && ', '}
          <CourseLink code={code} />
        </span>
      ))}
    </>
  );
}
