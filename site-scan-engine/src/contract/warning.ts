/** Non-fatal problem the run continues past (a dropped site, a failed reporter, a throwing listener…). */
export interface WarningEvent {
    /** Who raised it: a plugin id, `engine`, … */
    readonly source: string;
    readonly message: string;
}

export type WarningSink = (warning: WarningEvent) => void;
