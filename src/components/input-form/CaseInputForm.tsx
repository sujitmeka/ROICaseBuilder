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
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      companyType: "public",
      serviceType: "experience-transformation-design",
    },
  });

  // Register all fields so react-hook-form tracks them
  register("companyName");
  register("industryVertical");
  register("companyType");
  register("estimatedProjectCost", { valueAsNumber: true });
  register("serviceType");

  async function onSubmit(data: CaseInput) {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
      const { caseId } = await res.json();
      router.push(`/cases/${caseId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
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
        <label className="block text-sm font-medium mb-2">
          Company Type
        </label>
        <div className="flex gap-2">
          {(["public", "private"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setValue("companyType", type)}
              className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                watch("companyType") === type
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {type === "public" ? "Public" : "Private"}
            </button>
          ))}
        </div>
        {errors.companyType && (
          <p className="mt-1 text-sm text-red-600">
            {errors.companyType.message}
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

      <div>
        <label
          htmlFor="estimatedProjectCost"
          className="block text-sm font-medium mb-1"
        >
          Estimated Project Cost
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
            $
          </span>
          <input
            id="estimatedProjectCost"
            type="number"
            min="1"
            step="1000"
            placeholder="e.g. 500000"
            {...register("estimatedProjectCost", { valueAsNumber: true })}
            className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {errors.estimatedProjectCost && (
          <p className="mt-1 text-sm text-red-600">
            {errors.estimatedProjectCost.message}
          </p>
        )}
      </div>

      {submitError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-md p-3">
          {submitError}
        </p>
      )}

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
