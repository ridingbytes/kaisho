import {
  UserProfileSection,
  ProfilesSection,
} from "./GeneralTab";

export function ProfileTab(): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <UserProfileSection />
      <ProfilesSection />
    </div>
  );
}
