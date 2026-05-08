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

4. **Ghibli Continuity Protocol (The 5-Layer Seamless Flow):**
   - Read the entire script to ensure a logical and physical flow across 5 layers: **Time -> Location -> Environment -> Atmosphere -> Weather**.
   - **Temporal Logic:** Ensure the sun's position moves realistically (Dawn -> Morning -> Midday -> Afternoon -> Sunset -> Twilight).
   - **Atmospheric Synchronization:** Adjacent scenes must share consistent lighting tones.
   - **CRITICAL: Lighting Terminology Check:** 
     - **NEVER** use "Golden-hour" or "Amber" for Midday/Morning scenes. Use "Bright/Natural Morning Sun" or "High-contrast Midday Light".
     - "Golden-hour" is strictly reserved for Sunrise or Sunset to prevent AI from generating incorrect orange/red hues.
   - **Environmental Transitions:** If a scene moves from mist to clear sun, ensure there is a "receding mist" or "dappled light" transition scene to bridge the gap.

5. **Global Layout Mapping & Spatial Consistency:**
   - **MANDATORY:** Read the FULL script before creating any prompts to establish a fixed "Mental Map" of each location.
   - **Asset Consistency (No Pop-ups):** If a location (e.g., Garden) contains specific assets (potato patch, fence, tree), these **MUST** be described consistently in the `Scenery` field of EVERY scene at that location, even if they are just in the background.
   - **Character Blocking:** Explicitly describe character positions relative to these fixed assets (e.g., "Satsuki at the left potato patch", "Mei at the right onion rows") to prevent characters from overlapping or jumping positions between frames.
   - **Object Persistence:** Ensure objects introduced in early scenes (like a basket or a tool) remain visible or accounted for in subsequent scenes in the same area.

6. **Isolation of Technical Fields:**
   - Do **NOT** modify the content of `CAMERA`, `AUDIO`, or `VISUAL FX` fields unless they contain a character/BG name that must be synchronized. Otherwise, leave them as-is to preserve the user's technical intent.

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
