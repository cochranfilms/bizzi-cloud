"use client";

import { useState, useCallback, useEffect } from "react";
import {
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirebaseAuth, getFirebaseStorage } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";

export function useProfileUpdate() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(
    user?.displayName ?? user?.email?.split("@")[0] ?? ""
  );
  const [photoURL, setPhotoURL] = useState(user?.photoURL ?? "");

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? user.email?.split("@")[0] ?? "");
      setPhotoURL(user.photoURL ?? "");
    }
  }, [user]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const isEmailProvider = user?.providerData?.[0]?.providerId === "password";

  const uploadPhoto = useCallback(
    async (file: File) => {
      const u = getFirebaseAuth().currentUser;
      if (!u) return;
      setError(null);
      const storage = getFirebaseStorage();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `profiles/${u.uid}/avatar.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateProfile(u, { photoURL: url });
      setPhotoURL(url);
    },
    []
  );

  const updateDisplayName = useCallback(async () => {
    const u = getFirebaseAuth().currentUser;
    if (!u) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await updateProfile(u, { displayName: displayName.trim() || null });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setLoading(false);
    }
  }, [displayName]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const u = getFirebaseAuth().currentUser;
      if (!u?.email) return;
      setPasswordLoading(true);
      setPasswordError(null);
      setPasswordSuccess(false);
      try {
        const credential = EmailAuthProvider.credential(u.email, currentPassword);
        await reauthenticateWithCredential(u, credential);
        await updatePassword(u, newPassword);
        setPasswordSuccess(true);
        setTimeout(() => setPasswordSuccess(false), 3000);
      } catch (err) {
        setPasswordError(err instanceof Error ? err.message : "Failed to update password");
      } finally {
        setPasswordLoading(false);
      }
    },
    []
  );

  return {
    user,
    displayName,
    setDisplayName,
    photoURL: (photoURL || user?.photoURL) ?? "",
    uploadPhoto,
    updateDisplayName,
    changePassword,
    loading,
    error,
    success,
    passwordLoading,
    passwordError,
    passwordSuccess,
    isEmailProvider,
  };
}
