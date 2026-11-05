"use client";
import dynamic from "next/dynamic";
import { Loader } from "@/components/brand/Loader";

const NoSSR = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export default dynamic(() => Promise.resolve(NoSSR), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[320px] place-items-center">
      <Loader size="md" label="Drawing the chart" delayed />
    </div>
  ),
});
