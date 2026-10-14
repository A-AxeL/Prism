# Prism release notes

Shown in the app after an update (menu › What’s new shows them all). Newest first. Each release is a
`## <release> (date)` heading matching "release" in project.json, followed by `- ` items written for players.

## 0.46.2 (October 2026)
- Performance survey, more accurate: every test renders the same 1600×900 picture, so results compare across screens and windows.
- Frame times come from the graphics card's own clock where the browser allows it, so fast scenes are no longer capped by the screen's refresh rate.
- The camera now sways gently around each scene's own view instead of circling it, so the Cornell Box and other rooms stay in frame.
- Tests that render nothing, or too few frames, are run again and left out of the score if they still fail.

## 0.46.1 (October 2026)
- Fixed some UI stuff.

## 0.46.0 (October 2026)
- Shaders are compiled once on the first launch, with a progress window, and kept by your browser. Switching scenes and changing settings no longer pauses while shaders compile.
- What’s new: after each update, these notes appear once. Find them any time in Render › Tools.
- Cleaner menus: Earth and Mars side by side in Scenes, a new Color tab in Camera for white balance and lens effects, and a Tools section in Render.
- The performance survey pauses while Prism is hidden instead of stalling.
- The first visit starts each space scene with its own exposure, so Earth is no longer washed out.

## 0.45.9 (October 2026)
- First public release: the website and the Windows app, both updating themselves.
- Performance survey: benchmark your device and choose whether to share the results.
