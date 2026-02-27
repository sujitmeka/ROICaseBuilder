"use client";

import { useParams } from "next/navigation";
import { ResultsLayout } from "../../../components/results/ResultsLayout";

export default function CasePage() {
  const params = useParams();
  const caseId = params.caseId as string;

  return <ResultsLayout caseId={caseId} />;
}
