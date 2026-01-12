/* eslint-disable no-undef */
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, generateQuietPrompt, saveChat, reloadCurrentChat, eventSource, event_types, addOneMessage, getRequestHeaders, appendMediaToMessage } from "../../../../script.js";
import { saveBase64AsFile } from "../../../utils.js";
import { humanizedDateTime } from "../../../RossAscends-mods.js";
import { Popup, POPUP_TYPE } from "../../../popup.js";

const extensionName = "image-gen-kazuma";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// --- UPDATED CONSTANTS (With Dscriptions) ---
const KAZUMA_PLACEHOLDERS = [
    { key: '"*input*"', desc: "Positive Prompt (Text)" },
    { key: '"*ninput*"', desc: "Negative Prompt (Text)" },
    { key: '"*seed*"', desc: "Seed (Integer)" },
    { key: '"*steps*"', desc: "Sampling Steps (Integer)" },
    { key: '"*cfg*"', desc: "CFG Scale (Float)" },
    { key: '"*denoise*"', desc: "Denoise Strength (Float)" },
    { key: '"*clip_skip*"', desc: "CLIP Skip (Integer)" },
    { key: '"*model*"', desc: "Checkpoint Name" },
    { key: '"*sampler*"', desc: "Sampler Name" },
    { key: '"*width*"', desc: "Image Width (px)" },
    { key: '"*height*"', desc: "Image Height (px)" },
    { key: '"*lora*"', desc: "LoRA 1 Filename" },
    { key: '"*lorawt*"', desc: "LoRA 1 Weight (Float)" },
    { key: '"*lora2*"', desc: "LoRA 2 Filename" },
    { key: '"*lorawt2*"', desc: "LoRA 2 Weight (Float)" },
    { key: '"*lora3*"', desc: "LoRA 3 Filename" },
    { key: '"*lorawt3*"', desc: "LoRA 3 Weight (Float)" },
    { key: '"*lora4*"', desc: "LoRA 4 Filename" },
    { key: '"*lorawt4*"', desc: "LoRA 4 Weight (Float)" }
];

const RESOLUTIONS = [
    { label: "1024 x 1024 (SDXL 1:1)", w: 1024, h: 1024 },
    { label: "1152 x 896 (SDXL Landscape)", w: 1152, h: 896 },
    { label: "896 x 1152 (SDXL Portrait)", w: 896, h: 1152 },
    { label: "1216 x 832 (SDXL Landscape)", w: 1216, h: 832 },
    { label: "832 x 1216 (SDXL Portrait)", w: 832, h: 1216 },
    { label: "1344 x 768 (SDXL Landscape)", w: 1344, h: 768 },
    { label: "768 x 1344 (SDXL Portrait)", w: 768, h: 1344 },
    { label: "512 x 512 (SD 1.5 1:1)", w: 512, h: 512 },
    { label: "768 x 512 (SD 1.5 Landscape)", w: 768, h: 512 },
    { label: "512 x 768 (SD 1.5 Portrait)", w: 512, h: 768 },
];

const defaultWorkflowData = {
  "3": { "inputs": { "seed": "seed", "steps": 20, "cfg": 7, "sampler_name": "sampler", "scheduler": "normal", "denoise": 1, "model": ["35", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] }, "class_type": "KSampler" },
  "4": { "inputs": { "ckpt_name": "model" }, "class_type": "CheckpointLoaderSimple" },
  "5": { "inputs": { "width": "width", "height": "height", "batch_size": 1 }, "class_type": "EmptyLatentImage" },
  "6": { "inputs": { "text": "input", "clip": ["35", 1] }, "class_type": "CLIPTextEncode" },
  "7": { "inputs": { "text": "ninput", "clip": ["35", 1] }, "class_type": "CLIPTextEncode" },
  "8": { "inputs": { "samples": ["33", 0], "vae": ["4", 2] }, "class_type": "VAEDecode" },
  "14": { "inputs": { "images": ["8", 0] }, "class_type": "PreviewImage" },
  "33": { "inputs": { "seed": "seed", "steps": 20, "cfg": 7, "sampler_name": "sampler", "scheduler": "normal", "denoise": 0.5, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["34", 0] }, "class_type": "KSampler" },
  "34": { "inputs": { "upscale_method": "nearest-exact", "scale_by": 1.2, "samples": ["3", 0] }, "class_type": "LatentUpscaleBy" },
  "35": { "inputs": { "lora_name": "lora", "strength_model": "lorawt", "strength_clip": "lorawt", "model": ["4", 0], "clip": ["4", 1] }, "class_type": "LoraLoader" }
};

const defaultSettings = {
    enabled: true,
    debugPrompt: false,
    comfyUrl: "http://127.0.0.1:8188",
    connectionProfile: "",
    currentWorkflowName: "", // Server manages this now
    selectedModel: "",
    selectedLora: "",
    selectedLora2: "",
    selectedLora3: "",
    selectedLora4: "",
    selectedLoraWt: 1.0,
    selectedLoraWt2: 1.0,
    selectedLoraWt3: 1.0,
    selectedLoraWt4: 1.0,
    imgWidth: 1024,
    imgHeight: 1024,
    autoGenEnabled: false,
    autoGenFreq: 1,
    customNegative: "bad quality, blurry, worst quality, low quality",
    customSeed: -1,
    selectedSampler: "euler",
    compressImages: true,
    steps: 20,
    cfg: 7.0,
    denoise: 0.5,
    clipSkip: 1
};

async function loadSettings() {
    if (!extension_settings[extensionName]) extension_settings[extensionName] = {};
    for (const key in defaultSettings) {
        if (typeof extension_settings[extensionName][key] === 'undefined') {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }

    $("#kazuma_enable").prop("checked", extension_settings[extensionName].enabled);
    $("#kazuma_debug").prop("checked", extension_settings[extensionName].debugPrompt);
    $("#kazuma_url").val(extension_settings[extensionName].comfyUrl);
    $("#kazuma_width").val(extension_settings[extensionName].imgWidth);
    $("#kazuma_height").val(extension_settings[extensionName].imgHeight);
    $("#kazuma_auto_enable").prop("checked", extension_settings[extensionName].autoGenEnabled);
    $("#kazuma_auto_freq").val(extension_settings[extensionName].autoGenFreq);

    $("#kazuma_lora_wt").val(extension_settings[extensionName].selectedLoraWt);
    $("#kazuma_lora_wt_display").text(extension_settings[extensionName].selectedLoraWt);
    $("#kazuma_lora_wt_2").val(extension_settings[extensionName].selectedLoraWt2);
    $("#kazuma_lora_wt_display_2").text(extension_settings[extensionName].selectedLoraWt2);
    $("#kazuma_lora_wt_3").val(extension_settings[extensionName].selectedLoraWt3);
    $("#kazuma_lora_wt_display_3").text(extension_settings[extensionName].selectedLoraWt3);
    $("#kazuma_lora_wt_4").val(extension_settings[extensionName].selectedLoraWt4);
    $("#kazuma_lora_wt_display_4").text(extension_settings[extensionName].selectedLoraWt4);

    $("#kazuma_negative").val(extension_settings[extensionName].customNegative);
    $("#kazuma_seed").val(extension_settings[extensionName].customSeed);
    $("#kazuma_compress").prop("checked", extension_settings[extensionName].compressImages);

    updateSliderInput('kazuma_steps', 'kazuma_steps_val', extension_settings[extensionName].steps);
    updateSliderInput('kazuma_cfg', 'kazuma_cfg_val', extension_settings[extensionName].cfg);
    updateSliderInput('kazuma_denoise', 'kazuma_denoise_val', extension_settings[extensionName].denoise);
    updateSliderInput('kazuma_clip', 'kazuma_clip_val', extension_settings[extensionName].clipSkip);

    populateResolutions();
    populateProfiles();
    populateWorkflows();
    await fetchComfyLists();
}

function updateSliderInput(sliderId, numberId, value) {
    $(`#${sliderId}`).val(value);
    $(`#${numberId}`).val(value);
}

function populateResolutions() {
    const sel = $("#kazuma_resolution_list");
    sel.empty().append('<option value="">-- Select Preset --</option>');
    RESOLUTIONS.forEach((r, idx) => {
        sel.append(`<option value="${idx}">${r.label}</option>`);
    });
}

// --- WORKFLOW MANAGER ---
async function populateWorkflows() {
    const sel = $("#kazuma_workflow_list");
    sel.empty();
    try {
        const response = await fetch('/api/sd/comfy/workflows', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ url: extension_settings[extensionName].comfyUrl }),
        });

        if (response.ok) {
            const workflows = await response.json();
            workflows.forEach(w => {
                sel.append(`<option value="${w}">${w}</option>`);
            });

            if (extension_settings[extensionName].currentWorkflowName) {
                if (workflows.includes(extension_settings[extensionName].currentWorkflowName)) {
                    sel.val(extension_settings[extensionName].currentWorkflowName);
                } else if (workflows.length > 0) {
                    sel.val(workflows[0]);
                    extension_settings[extensionName].currentWorkflowName = workflows[0];
                    saveSettingsDebounced();
                }
            } else if (workflows.length > 0) {
                sel.val(workflows[0]);
                extension_settings[extensionName].currentWorkflowName = workflows[0];
                saveSettingsDebounced();
            }
        }
    } catch (e) {
        sel.append('<option disabled>Failed to load</option>');
    }
}

async function onComfyNewWorkflowClick() {
    let name = await prompt("New workflow file name (e.g. 'my_flux.json'):");
    if (!name) return;
    if (!name.toLowerCase().endsWith('.json')) name += '.json';

    try {
        const res = await fetch('/api/sd/comfy/save-workflow', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ file_name: name, workflow: '{}' })
        });
        if (!res.ok) throw new Error(await res.text());
        toastr.success("Workflow created!");
        await populateWorkflows();
        $("#kazuma_workflow_list").val(name).trigger('change');
        setTimeout(onComfyOpenWorkflowEditorClick, 500);
    } catch (e) { toastr.error(e.message); }
}

async function onComfyDeleteWorkflowClick() {
    const name = extension_settings[extensionName].currentWorkflowName;
    if (!name) return;
    if (!confirm(`Delete ${name}?`)) return;

    try {
        const res = await fetch('/api/sd/comfy/delete-workflow', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ file_name: name })
        });
        if (!res.ok) throw new Error(await res.text());
        toastr.success("Deleted.");
        await populateWorkflows();
    } catch (e) { toastr.error(e.message); }
}

// --- UPDATED EDITOR LOGIC (Fix Save) ---
async function onComfyOpenWorkflowEditorClick() {
    const name = extension_settings[extensionName].currentWorkflowName;
    if (!name) return toastr.warning("No workflow selected");

    let workflowContent = "";
    try {
        const res = await fetch('/api/sd/comfy/workflow', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ file_name: name })
        });
        if (res.ok) {
            const rawBody = await res.json();
            let jsonObj = rawBody;
            if (typeof rawBody === 'string') {
                try { jsonObj = JSON.parse(rawBody); } catch(e) {}
            }
            workflowContent = JSON.stringify(jsonObj, null, 4);
        }
    } catch (e) { return toastr.error("Failed to load file"); }

    const editorHtml = `
        <div style="display: flex; height: 75vh; width: 100%; gap: 15px;">
            <div style="flex-grow: 1; display: flex; flex-direction: column; min-width: 0;">
                <h3 style="margin: 0 0 5px 0;">${name} (JSON)</h3>
                <textarea id="kazuma_editor_text" class="text_pole" style="flex: 1; font-family: monospace; white-space: pre; resize: none; font-size: 13px; padding: 10px;"></textarea>
            </div>
            <div style="width: 300px; flex-shrink: 0; display: flex; flex-direction: column; border-left: 1px solid var(--smart-border-color); padding-left: 10px;">
                <h3 style="margin: 0 0 5px 0;">Reference</h3>
                <small style="opacity:0.7; margin-bottom: 10px;">Valid placeholders:</small>
                <div id="kazuma_editor_list" style="overflow-y: auto; flex: 1; padding-right: 5px;">
                    <!-- Items go here -->
                </div>
            </div>
        </div>
    `;

    // 1. Variable to hold data before popup closes
    let contentToSave = null;

    const saveValue = () => {
        contentToSave = $('#kazuma_editor_text').val();
        try {
            JSON.parse(contentToSave);
            return true; // Allow close
        } catch (e) {
            toastr.error("Invalid JSON");
            return false; // Block close
        }
    };

    const popup = new Popup($(editorHtml), POPUP_TYPE.CONFIRM, '', { okButton: 'Save', cancelButton: 'Cancel', wide: true, large: true, onClosing: saveValue });

    popup.show().then(async (result) => {
        // 2. Use the captured variable, NOT the jQuery selector (which might be empty/gone now)
        if (result && contentToSave) {
            try {
                const minified = JSON.stringify(JSON.parse(contentToSave));
                const res = await fetch('/api/sd/comfy/save-workflow', {
                    method: 'POST', headers: getRequestHeaders(),
                    body: JSON.stringify({ file_name: name, workflow: minified })
                });
                if (!res.ok) throw new Error(await res.text());
                toastr.success("Saved!");
            } catch (e) { toastr.error("Save Failed: " + e.message); }
        }
    });

    setTimeout(() => {
        const textArea = $('#kazuma_editor_text');
        textArea.val(workflowContent);

        const list = $('#kazuma_editor_list');
        KAZUMA_PLACEHOLDERS.forEach(item => {
            const div = $('<div></div>')
                .css({
                    'padding': '6px 4px',
                    'margin-bottom': '4px',
                    'border-bottom': '1px solid rgba(128,128,128,0.1)',
                    'font-family': 'monospace',
                    'font-size': '13px',
                    'display': 'flex',
                    'flex-direction': 'column'
                });

            const keySpan = $('<span></span>').text(item.key).css('font-weight', 'bold');
            const descSpan = $('<span></span>').text(item.desc).css({ 'font-size': '11px', 'opacity': '0.7', 'margin-top': '2px', 'font-family': 'sans-serif' });

            div.append(keySpan).append(descSpan);
            list.append(div);
        });

        const highlight = () => {
            const txt = textArea.val();
            list.children().each(function() {
                const keyText = $(this).find('span').first().text();
                // Simple string check
                if (txt.includes(keyText.replace(/"/g, ''))) { // flexible match
                     $(this).css({'border-left': '4px solid #4caf50', 'color': '#4caf50'});
                } else if (txt.includes(keyText)) {
                     $(this).css({'border-left': '4px solid #4caf50', 'color': '#4caf50'});
                } else {
                    $(this).css({'border-left': '1px solid transparent', 'color': 'var(--smart-text-color)'});
                }
            });
        };
        textArea.on('input', highlight);
        highlight();
    }, 50);
}


// --- FETCH LISTS ---
async function fetchComfyLists() {
    const comfyUrl = extension_settings[extensionName].comfyUrl;
    const modelSel = $("#kazuma_model_list");
    const samplerSel = $("#kazuma_sampler_list");
    const loraSelectors = [ $("#kazuma_lora_list"), $("#kazuma_lora_list_2"), $("#kazuma_lora_list_3"), $("#kazuma_lora_list_4") ];

    try {
        const modelRes = await fetch('/api/sd/comfy/models', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: comfyUrl }) });
        if (modelRes.ok) {
            const models = await modelRes.json();
            modelSel.empty().append('<option value="">-- Select Model --</option>');
            models.forEach(m => {
                let val = (typeof m === 'object' && m !== null) ? m.value : m;
                let text = (typeof m === 'object' && m !== null && m.text) ? m.text : val;
                modelSel.append(`<option value="${val}">${text}</option>`);
            });
            if (extension_settings[extensionName].selectedModel) modelSel.val(extension_settings[extensionName].selectedModel);
        }

        const samplerRes = await fetch('/api/sd/comfy/samplers', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: comfyUrl }) });
        if (samplerRes.ok) {
            const samplers = await samplerRes.json();
            samplerSel.empty();
            samplers.forEach(s => samplerSel.append(`<option value="${s}">${s}</option>`));
            if (extension_settings[extensionName].selectedSampler) samplerSel.val(extension_settings[extensionName].selectedSampler);
        }

        const loraRes = await fetch(`${comfyUrl}/object_info/LoraLoader`);
        if (loraRes.ok) {
            const json = await loraRes.json();
            const files = json['LoraLoader'].input.required.lora_name[0];
            loraSelectors.forEach((sel, i) => {
                const k = i === 0 ? "selectedLora" : `selectedLora${i + 1}`;
                const v = extension_settings[extensionName][k];
                sel.empty().append('<option value="">-- No LoRA --</option>');
                files.forEach(f => sel.append(`<option value="${f}">${f}</option>`));
                if (v) sel.val(v);
            });
        }
    } catch (e) {
        console.warn(`[${extensionName}] Failed to fetch lists.`, e);
    }
}

async function onTestConnection() {
    const url = extension_settings[extensionName].comfyUrl;
    try {
        const result = await fetch('/api/sd/comfy/ping', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: url }) });
        if (result.ok) {
            toastr.success("ComfyUI API connected!", "Image Gen Kazuma");
            await fetchComfyLists();
        } else { throw new Error('ComfyUI returned an error via proxy.'); }
    } catch (error) { toastr.error(`Connection failed: ${error.message}`, "Image Gen Kazuma"); }
}

// --- GENERATION HANDLERS ---
async function onGeneratePrompt() {
    if (!extension_settings[extensionName].enabled) return;
    const context = getContext();
    if (!context.chat || context.chat.length === 0) return toastr.warning("No chat history.");

    const requestedProfile = extension_settings[extensionName].connectionProfile;
    const targetDropdown = $("#settings_preset_openai");
    const originalProfile = targetDropdown.val();
    let didSwitch = false;

    if (requestedProfile && requestedProfile !== originalProfile && requestedProfile !== "") {
        toastr.info(`Switching presets...`);
        targetDropdown.val(requestedProfile).trigger("change");
        await new Promise(r => setTimeout(r, 1000));
        didSwitch = true;
    }

    try {
        toastr.info("Visualizing...", "Image Gen Kazuma");
        const lastMessage = context.chat[context.chat.length - 1].mes;
        const promptRequest = `Describe the following scene as a keyword-heavy image prompt. Scene: "${lastMessage}"`;
        const generatedText = await generateQuietPrompt(promptRequest, true);

        if (didSwitch) {
            targetDropdown.val(originalProfile).trigger("change");
            await new Promise(r => setTimeout(r, 500));
        }

        if (extension_settings[extensionName].debugPrompt) alert("DIAGNOSTIC:\n" + generatedText);

        await generateWithComfy(generatedText, null);

    } catch (err) {
        if (didSwitch) targetDropdown.val(originalProfile).trigger("change");
        console.error(err);
        toastr.error("Generation failed. Check console.");
    }
}

async function generateWithComfy(positivePrompt, target = null) {
    const url = extension_settings[extensionName].comfyUrl;
    const currentName = extension_settings[extensionName].currentWorkflowName;

    // Load from server
    let workflowRaw;
    try {
        const res = await fetch('/api/sd/comfy/workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: currentName }) });
        if (!res.ok) throw new Error("Load failed");
        workflowRaw = await res.json();
    } catch (e) { return toastr.error(`Could not load ${currentName}`); }

    let workflow = (typeof workflowRaw === 'string') ? JSON.parse(workflowRaw) : workflowRaw;

    let finalSeed = parseInt(extension_settings[extensionName].customSeed);
    if (finalSeed === -1 || isNaN(finalSeed)) {
        finalSeed = Math.floor(Math.random() * 1000000000);
    }

    workflow = injectParamsIntoWorkflow(workflow, positivePrompt, finalSeed);

    try {
        toastr.info("Sending to ComfyUI...", "Image Gen Kazuma");
        const res = await fetch(`${url}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow }) });
        if(!res.ok) throw new Error("Failed");
        const data = await res.json();
        await waitForGeneration(url, data.prompt_id, positivePrompt, target);
    } catch(e) { toastr.error("Comfy Error: " + e.message); }
}

function injectParamsIntoWorkflow(workflow, promptText, finalSeed) {
    const s = extension_settings[extensionName];
    let seedInjected = false;

    for (const nodeId in workflow) {
        const node = workflow[nodeId];
        if (node.inputs) {
            for (const key in node.inputs) {
                const val = node.inputs[key];

                if (val === "*input*") node.inputs[key] = promptText;
                if (val === "*ninput*") node.inputs[key] = s.customNegative || "";
                if (val === "*seed*") { node.inputs[key] = finalSeed; seedInjected = true; }
                if (val === "*sampler*") node.inputs[key] = s.selectedSampler || "euler";
                if (val === "*model*") node.inputs[key] = s.selectedModel || "v1-5-pruned.ckpt";

                if (val === "*steps*") node.inputs[key] = parseInt(s.steps) || 20;
                if (val === "*cfg*") node.inputs[key] = parseFloat(s.cfg) || 7.0;
                if (val === "*denoise*") node.inputs[key] = parseFloat(s.denoise) || 1.0;
                if (val === "*clip_skip*") node.inputs[key] = -Math.abs(parseInt(s.clipSkip)) || -1;

                if (val === "*lora*") node.inputs[key] = s.selectedLora || "None";
                if (val === "*lora2*") node.inputs[key] = s.selectedLora2 || "None";
                if (val === "*lora3*") node.inputs[key] = s.selectedLora3 || "None";
                if (val === "*lora4*") node.inputs[key] = s.selectedLora4 || "None";
                if (val === "*lorawt*") node.inputs[key] = parseFloat(s.selectedLoraWt) || 1.0;
                if (val === "*lorawt2*") node.inputs[key] = parseFloat(s.selectedLoraWt2) || 1.0;
                if (val === "*lorawt3*") node.inputs[key] = parseFloat(s.selectedLoraWt3) || 1.0;
                if (val === "*lorawt4*") node.inputs[key] = parseFloat(s.selectedLoraWt4) || 1.0;

                if (val === "*width*") node.inputs[key] = parseInt(s.imgWidth) || 512;
                if (val === "*height*") node.inputs[key] = parseInt(s.imgHeight) || 512;
            }
            if (!seedInjected && node.class_type === "KSampler" && 'seed' in node.inputs && typeof node.inputs['seed'] === 'number') {
               node.inputs.seed = finalSeed;
            }
        }
    }
    return workflow;
}

async function onImageSwiped(data) {
    if (!extension_settings[extensionName].enabled) return;
    const { message, direction, element } = data;
    const context = getContext();
    const settings = context.powerUserSettings || window.power_user;

    if (direction !== "right") return;
    if (settings && settings.image_overswipe !== "generate") return;
    if (message.name !== "Image Gen Kazuma") return;

    const media = message.extra?.media || [];
    const idx = message.extra?.media_index || 0;

    if (idx < media.length - 1) return;

    const mediaObj = media[idx];
    if (!mediaObj || !mediaObj.title) return;

    const prompt = mediaObj.title;
    toastr.info("New variation...", "Image Gen Kazuma");
    await generateWithComfy(prompt, { message: message, element: $(element) });
}

async function waitForGeneration(baseUrl, promptId, positivePrompt, target) {
     const checkInterval = setInterval(async () => {
        try {
            const h = await (await fetch(`${baseUrl}/history/${promptId}`)).json();
            if (h[promptId]) {
                clearInterval(checkInterval);
                const outputs = h[promptId].outputs;
                let finalImage = null;
                for (const nodeId in outputs) {
                    const nodeOutput = outputs[nodeId];
                    if (nodeOutput.images && nodeOutput.images.length > 0) {
                        finalImage = nodeOutput.images[0];
                        break;
                    }
                }
                if (finalImage) {
                    const imgUrl = `${baseUrl}/view?filename=${finalImage.filename}&subfolder=${finalImage.subfolder}&type=${finalImage.type}`;
                    await insertImageToChat(imgUrl, positivePrompt, target);
                }
            }
        } catch (e) {}
    }, 1000);
}

function blobToBase64(blob) { return new Promise((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob); }); }

function compressImage(base64Str, quality = 0.9) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => resolve(base64Str);
    });
}

// --- SAVE TO SERVER ---
async function insertImageToChat(imgUrl, promptText, target = null) {
    try {
        toastr.info("Downloading image...", "Image Gen Kazuma");
        const response = await fetch(imgUrl);
        const blob = await response.blob();
        let base64FullURL = await blobToBase64(blob);

        let format = "png";
        if (extension_settings[extensionName].compressImages) {
            base64FullURL = await compressImage(base64FullURL, 0.9);
            format = "jpeg";
        }

        const base64Raw = base64FullURL.split(',')[1];
        const context = getContext();
        let characterName = "User";
        if (context.groupId) {
            characterName = context.groups.find(x => x.id === context.groupId)?.id;
        } else if (context.characterId) {
            characterName = context.characters[context.characterId]?.name;
        }
        if (!characterName) characterName = "User";

        const filename = `${characterName}_${humanizedDateTime()}`;
        const savedPath = await saveBase64AsFile(base64Raw, characterName, filename, format);

        const mediaAttachment = {
            url: savedPath,
            type: "image",
            source: "generated",
            title: promptText,
            generation_type: "free",
        };

        if (target && target.message) {
            if (!target.message.extra) target.message.extra = {};
            if (!target.message.extra.media) target.message.extra.media = [];
            target.message.extra.media_display = "gallery";
            target.message.extra.media.push(mediaAttachment);
            target.message.extra.media_index = target.message.extra.media.length - 1;
            if (typeof appendMediaToMessage === "function") appendMediaToMessage(target.message, target.element);
            await saveChat();
            toastr.success("Gallery updated!");
        } else {
            const newMessage = {
                name: "Image Gen Kazuma", is_user: false, is_system: true, send_date: Date.now(),
                mes: "", extra: { media: [mediaAttachment], media_display: "gallery", media_index: 0, inline_image: false }, force_avatar: "img/five.png"
            };
            context.chat.push(newMessage);
            await saveChat();
            if (typeof addOneMessage === "function") addOneMessage(newMessage);
            else await reloadCurrentChat();
            toastr.success("Image inserted!");
        }

    } catch (err) { console.error(err); toastr.error("Failed to save/insert image."); }
}

// --- INIT ---
jQuery(async () => {
    try {
        await $.get(`${extensionFolderPath}/example.html`).then(h => $("#extensions_settings2").append(h));

        $("#kazuma_enable").on("change", (e) => { extension_settings[extensionName].enabled = $(e.target).prop("checked"); saveSettingsDebounced(); });
        $("#kazuma_debug").on("change", (e) => { extension_settings[extensionName].debugPrompt = $(e.target).prop("checked"); saveSettingsDebounced(); });
        $("#kazuma_url").on("input", (e) => { extension_settings[extensionName].comfyUrl = $(e.target).val(); saveSettingsDebounced(); });
        $("#kazuma_profile").on("change", (e) => { extension_settings[extensionName].connectionProfile = $(e.target).val(); saveSettingsDebounced(); });
        $("#kazuma_auto_enable").on("change", (e) => { extension_settings[extensionName].autoGenEnabled = $(e.target).prop("checked"); saveSettingsDebounced(); });
        $("#kazuma_auto_freq").on("input", (e) => { let v = parseInt($(e.target).val()); if(v<1)v=1; extension_settings[extensionName].autoGenFreq = v; saveSettingsDebounced(); });

        $("#kazuma_workflow_list").on("change", (e) => { extension_settings[extensionName].currentWorkflowName = $(e.target).val(); saveSettingsDebounced(); });
        $("#kazuma_import_btn").on("click", () => $("#kazuma_import_file").click());
        // NEW LISTENERS
        $("#kazuma_new_workflow").on("click", onComfyNewWorkflowClick);
        $("#kazuma_edit_workflow").on("click", onComfyOpenWorkflowEditorClick);
        $("#kazuma_delete_workflow").on("click", onComfyDeleteWorkflowClick);

        $("#kazuma_model_list").on("change", (e) => { extension_settings[extensionName].selectedModel = $(e.target).val(); saveSettingsDebounced(); });
        $("#kazuma_sampler_list").on("change", (e) => { extension_settings[extensionName].selectedSampler = $(e.target).val(); saveSettingsDebounced(); });
        $("#kazuma_resolution_list").on("change", (e) => {
            const idx = parseInt($(e.target).val());
            if (!isNaN(idx) && RESOLUTIONS[idx]) {
                const r = RESOLUTIONS[idx];
                $("#kazuma_width").val(r.w).trigger("input");
                $("#kazuma_height").val(r.h).trigger("input");
            }
        });

        $("#kazuma_lora_list").on("change", (e) => { extension_settings[extensionName].selectedLora = $(e.target).val(); saveSettingsDebounced(); });
        $("#kazuma_lora_list_2").on("change", (e) => { extension_settings[extensionName].selectedLora2 = $(e.target).val(); saveSettingsDebounced(); });
        $("#kazuma_lora_list_3").on("change", (e) => { extension_settings[extensionName].selectedLora3 = $(e.target).val(); saveSettingsDebounced(); });
        $("#kazuma_lora_list_4").on("change", (e) => { extension_settings[extensionName].selectedLora4 = $(e.target).val(); saveSettingsDebounced(); });
        $("#kazuma_lora_wt").on("input", (e) => { let v = parseFloat($(e.target).val()); extension_settings[extensionName].selectedLoraWt = v; $("#kazuma_lora_wt_display").text(v); saveSettingsDebounced(); });
        $("#kazuma_lora_wt_2").on("input", (e) => { let v = parseFloat($(e.target).val()); extension_settings[extensionName].selectedLoraWt2 = v; $("#kazuma_lora_wt_display_2").text(v); saveSettingsDebounced(); });
        $("#kazuma_lora_wt_3").on("input", (e) => { let v = parseFloat($(e.target).val()); extension_settings[extensionName].selectedLoraWt3 = v; $("#kazuma_lora_wt_display_3").text(v); saveSettingsDebounced(); });
        $("#kazuma_lora_wt_4").on("input", (e) => { let v = parseFloat($(e.target).val()); extension_settings[extensionName].selectedLoraWt4 = v; $("#kazuma_lora_wt_display_4").text(v); saveSettingsDebounced(); });

        $("#kazuma_width, #kazuma_height").on("input", (e) => { extension_settings[extensionName][e.target.id === "kazuma_width" ? "imgWidth" : "imgHeight"] = parseInt($(e.target).val()); saveSettingsDebounced(); });
        $("#kazuma_negative").on("input", (e) => { extension_settings[extensionName].customNegative = $(e.target).val(); saveSettingsDebounced(); });
        $("#kazuma_seed").on("input", (e) => { extension_settings[extensionName].customSeed = parseInt($(e.target).val()); saveSettingsDebounced(); });
        $("#kazuma_compress").on("change", (e) => { extension_settings[extensionName].compressImages = $(e.target).prop("checked"); saveSettingsDebounced(); });

        function bindSlider(id, key, isFloat = false) {
            $(`#${id}`).on("input", function() {
                let v = isFloat ? parseFloat(this.value) : parseInt(this.value);
                extension_settings[extensionName][key] = v;
                $(`#${id}_val`).val(v);
                saveSettingsDebounced();
            });
            $(`#${id}_val`).on("input", function() {
                let v = isFloat ? parseFloat(this.value) : parseInt(this.value);
                extension_settings[extensionName][key] = v;
                $(`#${id}`).val(v);
                saveSettingsDebounced();
            });
        }
        bindSlider("kazuma_steps", "steps", false);
        bindSlider("kazuma_cfg", "cfg", true);
        bindSlider("kazuma_denoise", "denoise", true);
        bindSlider("kazuma_clip", "clipSkip", false);

        $("#kazuma_test_btn").on("click", onTestConnection);
        $("#kazuma_gen_prompt_btn").on("click", onGeneratePrompt);

        loadSettings();
        eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
        eventSource.on(event_types.IMAGE_SWIPED, onImageSwiped);

        let att = 0; const int = setInterval(() => { if ($("#kazuma_quick_gen").length > 0) { clearInterval(int); return; } createChatButton(); att++; if (att > 5) clearInterval(int); }, 1000);
        $(document).on("click", "#kazuma_quick_gen", function(e) { e.preventDefault(); e.stopPropagation(); onGeneratePrompt(); });
    } catch (e) { console.error(e); }
});

// Helpers (Condensed)
function onMessageReceived(id) { if (!extension_settings[extensionName].enabled || !extension_settings[extensionName].autoGenEnabled) return; const chat = getContext().chat; if (!chat || !chat.length) return; if (chat[chat.length - 1].is_user || chat[chat.length - 1].is_system) return; const aiMsgCount = chat.filter(m => !m.is_user && !m.is_system).length; const freq = parseInt(extension_settings[extensionName].autoGenFreq) || 1; if (aiMsgCount % freq === 0) { console.log(`[${extensionName}] Auto-gen...`); setTimeout(onGeneratePrompt, 500); } }
function createChatButton() { if ($("#kazuma_quick_gen").length > 0) return; const b = `<div id="kazuma_quick_gen" class="interactable" title="Visualize" style="cursor: pointer; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; margin-right: 5px; opacity: 0.7;"><i class="fa-solid fa-paintbrush fa-lg"></i></div>`; let t = $("#send_but_sheld"); if (!t.length) t = $("#send_textarea"); if (t.length) { t.attr("id") === "send_textarea" ? t.before(b) : t.prepend(b); } }
function populateProfiles() { const s=$("#kazuma_profile"),o=$("#settings_preset_openai").find("option");s.empty().append('<option value="">-- Use Current Settings --</option>');if(o.length)o.each(function(){s.append(`<option value="${$(this).val()}">${$(this).text()}</option>`)});if(extension_settings[extensionName].connectionProfile)s.val(extension_settings[extensionName].connectionProfile);}
async function onFileSelected(e) { const f=e.target.files[0];if(!f)return;const t=await f.text();try{const j=JSON.parse(t),n=prompt("Name:",f.name.replace(".json",""));if(n){extension_settings[extensionName].savedWorkflows[n]=j;extension_settings[extensionName].currentWorkflowName=n;saveSettingsDebounced();populateWorkflows();}}catch{toastr.error("Invalid JSON");}$(e.target).val('');}
