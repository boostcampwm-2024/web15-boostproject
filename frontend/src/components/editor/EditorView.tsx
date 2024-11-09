import usePageStore from "@/store/usePageStore";
import Editor from ".";
import {
  usePage,
  useUpdatePage,
  useOptimisticUpdatePage,
} from "@/hooks/usePages";
import EditorLayout from "../layout/EditorLayout";
import EditorTitle from "./EditorTitle";
import { EditorInstance } from "novel";
import { useState } from "react";
import SaveStatus from "./ui/SaveStatus";
import { useDebouncedCallback } from "use-debounce";

export default function EditorView() {
  const { currentPage } = usePageStore();
  const { data, isLoading } = usePage(currentPage);
  const pageTitle = data?.title ?? "제목없음";
  const pageContent = data?.content ?? {};

  const updatePageMutation = useUpdatePage();
  const optimisticUpdatePageMutation = useOptimisticUpdatePage({
    id: currentPage ?? 0,
  });

  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved">("saved");

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaveStatus("unsaved");

    optimisticUpdatePageMutation.mutate(
      {
        pageData: { title: e.target.value, content: pageContent },
      },
      {
        onSuccess: () => setSaveStatus("saved"),
        onError: () => setSaveStatus("unsaved"),
      },
    );
  };

  const handleEditorUpdate = useDebouncedCallback(
    async ({ editor }: { editor: EditorInstance }) => {
      if (currentPage === null) {
        return;
      }

      const json = editor.getJSON();

      setSaveStatus("unsaved");
      updatePageMutation.mutate(
        { id: currentPage, pageData: { title: pageTitle, content: json } },
        {
          onSuccess: () => setSaveStatus("saved"),
          onError: () => setSaveStatus("unsaved"),
        },
      );
    },
    500,
  );

  if (isLoading || !data || currentPage === null) {
    return <div>로딩 중,,</div>;
  }

  return (
    <EditorLayout>
      <SaveStatus saveStatus={saveStatus} />
      <EditorTitle title={pageTitle} onTitleChange={handleTitleChange} />
      <Editor
        key={currentPage}
        initialContent={pageContent}
        pageId={currentPage}
        onEditorUpdate={handleEditorUpdate}
      />
    </EditorLayout>
  );
}
