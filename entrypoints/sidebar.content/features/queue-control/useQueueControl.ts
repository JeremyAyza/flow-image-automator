import { useAppStore } from '../../shared/useAppStore';
import { useTabId } from '../../shared/useTabId';
import { browser } from 'wxt/browser';
import { ScriptDataSchema, MultiScriptSchema } from '../../../../src/shared/script.schemas';
import { parseImagePromptToText } from '../../../../src/shared/script.parser';
import { z } from 'zod';

export const useQueueControl = () => {
  const tabId = useTabId();
  const {
    inputType, scriptName, parsedMultipleScripts, parsedScenes,
    setFileName, setParsedScenes, setError, setJsonText,
    setParsedMultipleScripts, resetForm
  } = useAppStore();

  const parseAndSetSingle = (jsonText: string) => {
    try {
      const parsed = ScriptDataSchema.safeParse(JSON.parse(jsonText));
      if (!parsed.success) throw new Error('El JSON no tiene el formato esperado (falta "scenes").');
      
      const prepared = parsed.data.scenes.map(s => ({
        scene_number: s.scene_number,
        prompt: parseImagePromptToText(s.image_prompt)
      }));
      if (parsed.data.thumbnail_prompt) {
        prepared.unshift({ scene_number: 0, prompt: parseImagePromptToText(parsed.data.thumbnail_prompt) });
      }
      setParsedScenes(prepared);
      setParsedMultipleScripts([]);
      setError('');
    } catch (e: any) {
      setError(e.message || 'JSON inválido.');
      setParsedScenes([]);
    }
  };

  const parseAndSetMultiple = (jsonText: string) => {
    try {
      const parsed = MultiScriptSchema.safeParse(JSON.parse(jsonText));
      if (!parsed.success) throw new Error('El formato múltiple no es válido.');
      
      const preparedScripts = Object.entries(parsed.data).map(([name, data]) => {
        const prompts = data.scenes.map(s => ({
          scene_number: s.scene_number,
          prompt: parseImagePromptToText(s.image_prompt)
        }));
        if (data.thumbnail_prompt) {
          prompts.unshift({ scene_number: 0, prompt: parseImagePromptToText(data.thumbnail_prompt) });
        }
        return { scriptName: name, prompts };
      });
      
      setParsedMultipleScripts(preparedScripts);
      setParsedScenes([]);
      setError('');
    } catch (e: any) {
      setError(e.message || 'JSON múltiple inválido.');
      setParsedMultipleScripts([]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (inputType === 'multiple') parseAndSetMultiple(text);
      else parseAndSetSingle(text);
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setJsonText(text);
    if (!text.trim()) {
      setParsedScenes([]); setParsedMultipleScripts([]); setError(''); return;
    }
    if (inputType === 'multiple') parseAndSetMultiple(text);
    else parseAndSetSingle(text);
  };

  const handleStartQueue = async () => {
    if (inputType !== 'multiple' && !scriptName.trim()) return setError('Ingresa un nombre para el script.');
    if (inputType === 'multiple' && parsedMultipleScripts.length === 0) return setError('Ingresa un JSON válido primero.');
    if (inputType !== 'multiple' && parsedScenes.length === 0) return setError('Ingresa un JSON válido primero.');
    if (!tabId) return setError('Error: No active tab found.');

    setError('');
    try {
      if (inputType === 'multiple') {
        for (const script of parsedMultipleScripts) {
          await browser.runtime.sendMessage({ type: 'START_QUEUE', scriptName: script.scriptName, prompts: script.prompts, tabId });
        }
      } else {
        await browser.runtime.sendMessage({ type: 'START_QUEUE', scriptName: scriptName.trim(), prompts: parsedScenes, tabId });
      }
      resetForm();
    } catch (err) {
      console.error(err);
      setError('Error al comunicar con la extensión.');
    }
  };

  return { handleFileUpload, handleTextChange, handleStartQueue };
};
