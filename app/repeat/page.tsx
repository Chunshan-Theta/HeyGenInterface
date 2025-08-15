"use client";

import RepeatAvatar from "@/components/repeatAvatar";

export default function RepeatPage() {
	return (
		<div className="w-screen h-screen flex flex-col">
			<div className="w-[900px] flex flex-col items-start justify-start gap-5 mx-auto pt-4 pb-20">
				<div className="w-full">
					<RepeatAvatar />
				</div>
			</div>
		</div>
	);
} 