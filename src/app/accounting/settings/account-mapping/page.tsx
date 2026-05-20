import AccountMappingPanel from "@/components/offering/AccountMappingPanel";
import HelpButton from "@/components/HelpButton";

export default function AccountMappingPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-bold text-gray-800">계정과목 매핑</h1>
        <HelpButton slug="acc-account-mapping" />
      </div>
      <p className="text-xs text-gray-500">
        연보·월정입금(전도회·건축) 등의 종류별 회계 수입 계정을 지정합니다.
        지정된 매핑은 결산 확정 또는 회계 반영 시 전표 자동 생성에 사용됩니다.
      </p>
      <AccountMappingPanel />
    </div>
  );
}
