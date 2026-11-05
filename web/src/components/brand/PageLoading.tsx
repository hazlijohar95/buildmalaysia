import { Loader } from "./Loader";

/**
 * The loading.tsx screen. Only routes that never call notFound() use it: once a loading boundary starts
 * streaming, a later notFound() answers 200, which the worker would then cache as a page.
 */
export default function PageLoading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Loader size="lg" label="Opening the books" delayed />
    </div>
  );
}
