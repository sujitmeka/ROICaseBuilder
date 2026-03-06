"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { caseInputSchema, type CaseInput } from "../../lib/schemas";
import { CompanyAutocomplete } from "./CompanyAutocomplete";
import { ServiceTypeSelect } from "./ServiceTypeSelect";

export function CaseInputForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ fileName: string; fileType: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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
      serviceType: "experience-transformation-design",
      projectContext: "",
    },
  });

  // Register fields that use custom components (setValue pattern).
  // estimatedProjectCost uses a native <input> with {...register()} spread, so skip it here.
  register("companyName");
  register("serviceType");

  async function handleFileUpload(file: File) {
    setIsUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }
      const { text, fileName, fileType } = await res.json();
      setValue("documentContent", text);
      setUploadedFile({ fileName, fileType });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setValue("documentContent", undefined);
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
    }
  }

  async function onSubmit(data: CaseInput) {
    setIsSubmitting(() => true);
    setSubmitError(() => null);
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
      startTransition(() => {
        router.push(`/cases/${caseId}`);
      });
    } catch (err) {
      setSubmitError(() => err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(() => false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label htmlFor="companyName" className="block text-sm font-medium text-[#a8a8a8] mb-1">
          Company Name
        </label>
        <CompanyAutocomplete
          value={watch("companyName")}
          onChange={(val) => setValue("companyName", val)}
        />
        {errors.companyName && (
          <p className="mt-1 text-sm text-red-400">
            {errors.companyName.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="serviceType" className="block text-sm font-medium text-[#a8a8a8] mb-1">
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
          <p className="mt-1 text-sm text-red-400">
            {errors.serviceType.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="estimatedProjectCost"
          className="block text-sm font-medium text-[#a8a8a8] mb-1"
        >
          Estimated Project Cost
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#707070] text-sm">
            $
          </span>
          <input
            id="estimatedProjectCost"
            type="number"
            min="1"
            step="any"
            placeholder="e.g. 500000"
            {...register("estimatedProjectCost", { valueAsNumber: true })}
            className="w-full rounded-sm border border-[#2a2a2a] bg-[#0a0a0a] pl-7 pr-3 py-2 text-sm text-white placeholder:text-[#707070] focus:border-white focus:ring-1 focus:ring-white focus:outline-none"
          />
        </div>
        {errors.estimatedProjectCost && (
          <p className="mt-1 text-sm text-red-400">
            {errors.estimatedProjectCost.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-[#a8a8a8] mb-1">
          Project Context <span className="text-[#707070] font-normal">(recommended)</span>
        </label>
        <p className="text-xs text-[#707070] mb-1">
          Describe the engagement: which part of the business, what customer journey, what problems you{"'"}re solving.
        </p>
        <textarea
          {...register("projectContext")}
          rows={4}
          maxLength={5000}
          placeholder="e.g. Nike wants to redesign their mobile checkout experience to reduce cart abandonment. The engagement focuses on the direct-to-consumer digital channel..."
          className="w-full rounded-sm border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-[#707070] focus:border-white focus:ring-1 focus:ring-white focus:outline-none resize-y"
        />
        {errors.projectContext && (
          <p className="mt-1 text-sm text-red-400">{errors.projectContext.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-[#a8a8a8] mb-1">
          Upload RFP or Brief <span className="text-[#707070] font-normal">(optional)</span>
        </label>
        <p className="text-xs text-[#707070] mb-1">
          Upload a PDF or Word document for additional context. The AI will extract and use its content.
        </p>
        {uploadedFile ? (
          <div className="flex items-center gap-2 rounded-sm border border-[#2a2a2a] bg-[#111111] px-3 py-2 text-sm">
            <span className="text-white">{uploadedFile.fileName}</span>
            <button
              type="button"
              onClick={() => {
                setUploadedFile(null);
                setValue("documentContent", undefined);
              }}
              className="ml-auto text-[#707070] hover:text-white text-xs"
            >
              Remove
            </button>
          </div>
        ) : (
          <input
            type="file"
            accept=".pdf,.docx"
            disabled={isUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className="w-full text-sm text-[#a8a8a8] file:mr-3 file:rounded-sm file:border file:border-[#2a2a2a] file:bg-[#111111] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#1a1a1a] disabled:opacity-50"
          />
        )}
        {isUploading && <p className="mt-1 text-xs text-[#a8a8a8]">Extracting document text...</p>}
        {uploadError && <p className="mt-1 text-sm text-red-400">{uploadError}</p>}
      </div>

      {submitError && (
        <p className="text-sm text-red-400 bg-red-950/50 border border-red-900/50 rounded-sm p-3">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || isPending || isUploading}
        className="w-full rounded-sm bg-white px-4 py-2 text-sm font-medium text-black hover:bg-[#e0e0e0] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Starting analysis..." : isPending ? "Navigating..." : "Generate ROI Case"}
      </button>
    </form>
  );
}
