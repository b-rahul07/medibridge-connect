import { useState, useRef, useEffect } from 'react';

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Start recording audio
  const startRecording = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create MediaRecorder instance
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      // Reset chunks
      chunksRef.current = [];
      
      // Add event listener for data availability
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      // Handle stop event
      mediaRecorder.onstop = () => {
        // Create a single Blob from all chunks
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        
        // Create Object URL for preview
        const url = URL.createObjectURL(blob);
        
        // Update state
        setAudioBlob(blob);
        setAudioURL(url);
        
        // Reset chunks
        chunksRef.current = [];
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };
      
      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not access microphone. Please check your permissions.');
    }
  };

  // Stop recording audio
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Clear recording
  const clearRecording = () => {
    // Revoke the old URL if it exists
    if (audioURL) {
      URL.revokeObjectURL(audioURL);
    }
    
    setAudioURL(null);
    setAudioBlob(null);
    setIsRecording(false);
  };

  // Cleanup: revoke audio URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (audioURL) {
        URL.revokeObjectURL(audioURL);
      }
    };
  }, [audioURL]);

  return {
    isRecording,
    audioURL,
    audioBlob,
    startRecording,
    stopRecording,
    clearRecording,
  };
};
