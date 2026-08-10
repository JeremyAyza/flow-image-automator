import { useAppStore } from '../store/useAppStore';
import { useTabId } from './useTabId';
import { browser } from 'wxt/browser';
import { ScriptData, ScriptScene } from '../../../utils/types';
import { parseImagePromptToText } from '../../../utils/parser';

export const useFileHandler = () => {
  const tabId = useTabId();
  const {
    inputType,
    scriptName,
    parsedMultipleScripts,
    parsedScenes,
    setFileName,
    setParsedScenes,
    setError,
    setJsonText,
    setParsedMultipleScripts,
    resetForm
  } = useAppStore();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string) as ScriptData;
        if (!json.scenes || !Array.isArray(json.scenes)) {
          setError('El archivo JSON no tiene el formato esperado (falta el array "scenes").');
          return;
        }

        const prepared = json.scenes.map((scene: ScriptScene) => ({
          scene_number: scene.scene_number,
          prompt: parseImagePromptToText(scene.image_prompt)
        }));

        if (json.thumbnail_prompt) {
          prepared.unshift({
            scene_number: 0,
            prompt: parseImagePromptToText(json.thumbnail_prompt)
          });
        }

        setParsedScenes(prepared);
        setError('');
      } catch (err) {
        console.error(err);
        setError('Error al leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setJsonText(text);
    if (!text.trim()) {
      setParsedScenes([]);
      setParsedMultipleScripts([]);
      setError('');
      return;
    }
    
    try {
      if (inputType === 'multiple') {
        const json = JSON.parse(text) as Record<string, ScriptData>;
        const preparedScripts = Object.entries(json).map(([name, scriptData]) => {
          if (!scriptData.scenes || !Array.isArray(scriptData.scenes)) {
            throw new Error(`El script ${name} no tiene el formato esperado (falta "scenes").`);
          }
          const preparedPrompts = scriptData.scenes.map((scene: ScriptScene) => ({
            scene_number: scene.scene_number,
            prompt: parseImagePromptToText(scene.image_prompt)
          }));

          if (scriptData.thumbnail_prompt) {
            preparedPrompts.unshift({
              scene_number: 0,
              prompt: parseImagePromptToText(scriptData.thumbnail_prompt)
            });
          }

          return {
            scriptName: name,
            prompts: preparedPrompts
          };
        });
        setParsedMultipleScripts(preparedScripts);
        setParsedScenes([]);
        setError('');
      } else {
        const json = JSON.parse(text) as ScriptData;
        if (!json.scenes || !Array.isArray(json.scenes)) {
          setError('El JSON no tiene el formato esperado (falta "scenes").');
          setParsedScenes([]);
          return;
        }
        console.log(json);
        const prepared = json.scenes.map((scene: ScriptScene) => ({
          scene_number: scene.scene_number,
          prompt: parseImagePromptToText(scene.image_prompt)
        }));

        if (json.thumbnail_prompt) {
          prepared.unshift({
            scene_number: 0,
            prompt: parseImagePromptToText(json.thumbnail_prompt)
          });
        }
        setParsedScenes(prepared);
        setParsedMultipleScripts([]);
        setError('');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'JSON inválido.');
      setParsedScenes([]);
      setParsedMultipleScripts([]);
    }
  };

  const handleStartQueue = async () => {
    if (inputType !== 'multiple' && !scriptName.trim()) {
      setError('Por favor, ingresa un nombre para el script.');
      return;
    }
    if (inputType === 'multiple' && parsedMultipleScripts.length === 0) {
      setError('Por favor, ingresa un JSON válido primero.');
      return;
    }
    if (inputType !== 'multiple' && parsedScenes.length === 0) {
      setError('Por favor, ingresa un JSON válido primero.');
      return;
    }

    setError('');
    try {
      // tabId viene del hook useTabId (cacheado en el store)
      if (!tabId) {
        setError('Error: No active tab found.');
        return;
      }

      if (inputType === 'multiple') {
        for (const script of parsedMultipleScripts) {
          await browser.runtime.sendMessage({
            type: 'START_QUEUE',
            scriptName: script.scriptName,
            prompts: script.prompts,
            tabId: tabId
          });
        }
      } else {
        await browser.runtime.sendMessage({
          type: 'START_QUEUE',
          scriptName: scriptName.trim(),
          prompts: parsedScenes,
          tabId: tabId
        });
      }

      resetForm();
    } catch (err) {
      console.error(err);
      setError('Error al comunicar con la extensión.');
    }
  };

  return {
    handleFileUpload,
    handleTextChange,
    handleStartQueue
  };
};
