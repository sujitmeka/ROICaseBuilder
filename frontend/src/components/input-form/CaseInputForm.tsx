"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { caseInputSchema, type CaseInput } from "../../lib/schemas";
import { CompanyAutocomplete } from "./CompanyAutocomplete";
import { IndustrySelect } from "./IndustrySelect";
import { ServiceTypeSelect } from "./ServiceTypeSelect";

export function CaseInputForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CaseInput>({
    resolver: zodResolver(caseInputSchema),
    defaultValues: {
      companyName: "",
      industryVertical: undefined,
      serviceType: "experience-transformation-design",
    },
  });

  // Register all fields so react-hook-form tracks them
  register("companyName");
  register("industryVertical");
  register("serviceType");

  async function onSubmit(data: CaseInput) {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const { caseId } = await res.json();
      router.push(`/cases/${caseId}`);
    } catch {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label htmlFor="companyName" className="block text-sm font-medium mb-1">
          Company Name
        </label>
        <CompanyAutocomplete
          value={watch("companyName")}
          onChange={(val) => setValue("companyName", val)}
        />
        {errors.companyName && (
          <p className="mt-1 text-sm text-red-600">
            {errors.companyName.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="industryVertical"
          className="block text-sm font-medium mb-1"
        >
          Industry Vertical
        </label>
        <IndustrySelect
          value={watch("industryVertical")}
          onChange={(val) =>
            setValue(
              "industryVertical",
              val as CaseInput["industryVertical"]
            )
          }
        />
        {errors.industryVertical && (
          <p className="mt-1 text-sm text-red-600">
            {errors.industryVertical.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="serviceType" className="block text-sm font-medium mb-1">
          Service Type
        </label>
        <ServiceTypeSelect
          value={
            watch("serviceType") ?? "experience-transformation-design"
          }
          onChange={(val) =>
            setValue("serviceType", val as CaseInput["serviceType"])
          }
        />
        {errors.serviceType && (
          <p className="mt-1 text-sm text-red-600">
            {errors.serviceType.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Starting analysis..." : "Generate ROI Case"}
      </button>
    </form>
  );
}
