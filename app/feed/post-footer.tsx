"use client";

import { useState } from "react";
import PostComments from "../showcase/post-comments";
import { PostActions } from "./feed-shell";

export function PostFooter({ postId, shareTitle }: { postId: string; shareTitle: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PostActions postId={postId} shareTitle={shareTitle} commentsOpen={open} onComments={() => setOpen((v) => !v)} />
      {open && <div style={{ padding: "0 16px 14px" }}><PostComments postId={postId} controlledOpen={open} /></div>}
    </>
  );
}
