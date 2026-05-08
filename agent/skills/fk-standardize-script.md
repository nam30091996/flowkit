# Ghibli Continuity Protocol — Standardization Skill

This skill ensures that animation scripts are perfectly synchronized with "LOCKED" assets for the Veo 3 production pipeline.

## Core Rules (MUST FOLLOW)

1. **Absolute Name Synchronization (IMAGE & ACTIONS):**
   - Every character name mentioned in the `IMAGE` and `ACTIONS` fields must be replaced with their **EXACT full name** from the `CHARACTERS AND OBJECTS (LOCKED)` section (e.g., replace "Satsuki" with "Satsuki Sato").
   - Failure to match character-for-character will break entity anchoring.

2. **Absolute BG Synchronization (ENVIRONMENT):**
   - Every background reference in the `ENVIRONMENT (SCENE)` field must be replaced with the **EXACT string** from the `LOCKED` section (e.g., replace "Kitchen" with "BG_5. Rustic Kitchen").
   - Do NOT add prefixes like "The" if they are not in the LOCKED definition.

3. **Preservation of Original Format:**
   - **NEVER** change the structural format of the original script (e.g., do not split into Location/Scenery/Atmosphere unless explicitly asked).
   - If the original script is one line, keep it one line. If it has specific metadata, keep it.

4. **Environmental Continuity:**
   - Read the entire script to ensure `ENVIRONMENT` descriptions flow logically in terms of **Time** (Dawn -> Morning -> Midday -> etc.) and **Weather**.
   - Synchronize these descriptions across adjacent scenes.

5. **Preservation of Technical & Operational Content:**
   - **PRESERVE** the `RENDERING RULES` section exactly as it is in the script file. Do NOT delete it.
   - **PRESERVE** the full `CAMERA` details (Movement, Framing, Focus) in the script file. Do NOT trim it to Lens only.
   - **Standardization only applies to NAMES:** Only replace character names and BG tags with the LOCKED versions. Leave all other text untouched.

## Pipeline Check
- [ ] Are all character names in IMAGE/ACTIONS matching LOCKED exactly?
- [ ] Are all BG names in ENVIRONMENT matching LOCKED exactly?
- [ ] Is the original script structure/formatting preserved?
- [ ] Is the temporal/atmospheric flow consistent?
- [ ] Are there any joined lines or corrupted headers (e.g., `aSCENE 21`)?

## Workflow

1.  **Verify/Update LOCKED**: Ensure all characters and the 5-6 core backgrounds are present.
2.  **Timeline Check**: Review the whole script to ensure the sun/weather moves realistically.
3.  **Search & Replace**: Systematically update every field to match the LOCKED strings.
4.  **Format Preservation**: Keep all headers (`IMAGE:`, `ACTIONS:`, etc.) and brackets exactly as they are.
